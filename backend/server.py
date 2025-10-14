from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import jwt
from passlib.context import CryptContext
import socketio
import json
import asyncio
from geopy.distance import geodesic
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
SECRET_KEY = "vatrogasci_secret_key_2024"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Socket.IO manager
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode='asgi')

# Create the main app
app = FastAPI()

# Socket.IO app
socket_app = socketio.ASGIApp(sio, app)

# Active connections tracking
active_connections: Dict[str, Dict] = {}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str
    full_name: str
    department: str  # DVD society or VZO
    role: str = "clan_bez_funkcije"
    is_vzo_member: bool = False  # NEW: VZO membership flag
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    department: str
    role: str = "clan_bez_funkcije"
    is_vzo_member: bool = False  # NEW: VZO membership

class UserLogin(BaseModel):
    username: str
    password: str

class Location(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    latitude: float
    longitude: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    status: str = "active"  # active, inactive, on_duty, available

class Hydrant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    latitude: float
    longitude: float
    address: Optional[str] = None  # NEW: Address field
    status: str = "working"  # working, broken, maintenance
    tip_hidranta: str = "nadzemni"  # NEW: podzemni, nadzemni
    last_check: Optional[datetime] = None
    notes: Optional[str] = None
    images: List[str] = []  # NEW: List of image URLs/base64
    checked_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HydrantCreate(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None  # NEW: Address field
    status: str = "working"
    tip_hidranta: str = "nadzemni"  # NEW
    notes: Optional[str] = None
    images: Optional[List[str]] = []  # NEW: Images as base64 strings

class HydrantUpdate(BaseModel):
    status: Optional[str] = None
    tip_hidranta: Optional[str] = None  # NEW
    address: Optional[str] = None  # NEW: Address field
    notes: Optional[str] = None
    images: Optional[List[str]] = None

# Helper functions
def create_access_token(data: dict):
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# NEW: VZO permission system
def has_vzo_full_access(user: User) -> bool:
    """VZO members with full access to everything"""
    if not user.is_vzo_member:
        return False
    vzo_full_roles = ["predsjednik_vzo", "tajnik_vzo", "zapovjednik_vzo", "zamjenik_zapovjednika_vzo"]
    return user.role in vzo_full_roles

def has_dvd_management_access(user: User) -> bool:
    """DVD presidents and commanders - access to their own DVD only"""
    dvd_management_roles = ["predsjednik", "zapovjednik", "zamjenik_zapovjednika"]
    return user.role in dvd_management_roles and not user.is_vzo_member

def has_hydrant_management_permission(user: User) -> bool:
    """All operational members can manage hydrants"""
    if has_vzo_full_access(user) or has_dvd_management_access(user):
        return True
    
    # All operational roles can manage hydrants
    operational_roles = [
        "zapovjednik", "zamjenik_zapovjednika", "zapovjednistvo", "predsjednik",
        "tajnik", "spremistar", "blagajnik", "upravni_odbor", "nadzorni_odbor"
    ]
    return user.role in operational_roles

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
        
        user = await db.users.find_one({"username": username})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# Base location for geofencing (center of operations)
BASE_LOCATION = (46.2508, 16.3755)  # Gornji Kneginec coordinates (corrected)
GEOFENCE_RADIUS_KM = 10

def is_within_geofence(lat: float, lon: float) -> bool:
    distance = geodesic(BASE_LOCATION, (lat, lon)).kilometers
    return distance <= GEOFENCE_RADIUS_KM

# Socket.IO events
@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")
    # Remove from active connections
    if sid in active_connections:
        del active_connections[sid]
    # Broadcast updated user locations
    await sio.emit('user_locations', list(active_connections.values()))

@sio.event
async def location_update(sid, data):
    try:
        user_id = data.get('user_id')
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        
        # Check geofencing
        within_fence = is_within_geofence(latitude, longitude)
        status = "active" if within_fence else "inactive"
        
        # Save location to database
        location_data = {
            "user_id": user_id,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": datetime.now(timezone.utc),
            "is_active": within_fence,
            "status": status
        }
        
        await db.locations.insert_one(location_data)
        
        # Update active connections
        active_connections[sid] = {
            "user_id": user_id,
            "latitude": latitude,
            "longitude": longitude,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Broadcast to all connected clients
        await sio.emit('user_locations', list(active_connections.values()))
        
    except Exception as e:
        print(f"Error handling location update: {e}")

@sio.event
async def ping_user(sid, data):
    target_user_id = data.get('target_user_id')
    from_user_id = data.get('from_user_id')
    
    # Find target user connection
    target_sid = None
    for connection_sid, connection_data in active_connections.items():
        if connection_data.get('user_id') == target_user_id:
            target_sid = connection_sid
            break
    
    if target_sid:
        await sio.emit('ping_received', {
            'from_user_id': from_user_id,
            'message': 'Ping from fellow firefighter!'
        }, room=target_sid)

# API Routes
@api_router.post("/register")
async def register(user: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"$or": [{"username": user.username}, {"email": user.email}]})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create user
    user_dict = user.dict()
    user_dict["password"] = hashed_password
    user_obj = User(**{k: v for k, v in user_dict.items() if k != "password"})
    
    result = await db.users.insert_one({**user_obj.dict(), "password": hashed_password})
    return {"message": "User created successfully", "user_id": user_obj.id}

@api_router.post("/login")
async def login(user_login: UserLogin):
    user = await db.users.find_one({"username": user_login.username})
    if not user or not verify_password(user_login.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": User(**user).dict()
    }

@api_router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.get("/users")
async def get_users(current_user: User = Depends(get_current_user)):
    # VZO members with full access can see all users
    if has_vzo_full_access(current_user):
        users = await db.users.find().to_list(1000)
        return [User(**user).dict() for user in users]
    
    # DVD management can see only their department
    elif has_dvd_management_access(current_user):
        users = await db.users.find({"department": current_user.department}).to_list(1000)
        return [User(**user).dict() for user in users]
    
    else:
        raise HTTPException(status_code=403, detail="Access denied")

# NEW: DVD Station model
class DVDStation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: str
    latitude: float
    longitude: float
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    established_year: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Extended User model with additional fields
class UserExtended(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str
    full_name: str
    department: str
    role: str = "clan_bez_funkcije"
    is_vzo_member: bool = False
    is_active: bool = True
    
    # NEW: Additional personal data
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    
    # NEW: Medical data
    medical_exam_date: Optional[datetime] = None
    medical_exam_valid_until: Optional[datetime] = None
    medical_restrictions: Optional[str] = None
    
    # NEW: Equipment assignments
    assigned_equipment: List[str] = []
    
    # NEW: Certifications
    certifications: List[str] = []
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Vehicle model
class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # cisterna, kombi, vatrogasno vozilo
    license_plate: str
    department: str
    year: Optional[int] = None
    
    # Technical inspection
    technical_inspection_date: Optional[datetime] = None
    technical_inspection_valid_until: Optional[datetime] = None
    
    # Service
    last_service_date: Optional[datetime] = None
    next_service_due: Optional[datetime] = None
    service_km: Optional[int] = None
    current_km: Optional[int] = None
    
    # Status
    status: str = "active"  # active, maintenance, out_of_service
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Equipment model
class Equipment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # helmet, suit, tank, hose, etc.
    serial_number: Optional[str] = None
    department: str
    location: str  # vehicle_id or station location
    
    # Maintenance
    last_inspection_date: Optional[datetime] = None
    next_inspection_due: Optional[datetime] = None
    condition: str = "good"  # good, needs_maintenance, damaged
    
    # Assignment
    assigned_to_user: Optional[str] = None
    assigned_to_vehicle: Optional[str] = None
    
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserUpdate(BaseModel):
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    is_vzo_member: Optional[bool] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    medical_exam_date: Optional[datetime] = None
    medical_exam_valid_until: Optional[datetime] = None
    assigned_equipment: Optional[List[str]] = None
    certifications: Optional[List[str]] = None

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_update: UserUpdate, current_user: User = Depends(get_current_user)):
    # Only VZO members with full access can update users
    if not has_vzo_full_access(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in user_update.dict().items() if v is not None}
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

# NEW: DVD Stations endpoints
@api_router.get("/dvd-stations", response_model=List[DVDStation])
async def get_dvd_stations(current_user: User = Depends(get_current_user)):
    stations = await db.dvd_stations.find().to_list(100)
    return [DVDStation(**station) for station in stations]

@api_router.post("/dvd-stations", response_model=DVDStation)
async def create_dvd_station(station: DVDStation, current_user: User = Depends(get_current_user)):
    # VZO can add any, DVD presidents can add their own
    if not (has_vzo_full_access(current_user) or 
            (current_user.role == "predsjednik" and not current_user.is_vzo_member)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.dvd_stations.insert_one(station.dict())
    return station

class DVDStationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    established_year: Optional[int] = None

@api_router.put("/dvd-stations/{station_id}")
async def update_dvd_station(station_id: str, station_update: DVDStationUpdate, current_user: User = Depends(get_current_user)):
    # VZO can update any, DVD presidents can update their own
    if not (has_vzo_full_access(current_user) or 
            (current_user.role == "predsjednik" and not current_user.is_vzo_member)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in station_update.dict().items() if v is not None}
    
    result = await db.dvd_stations.update_one({"id": station_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="DVD station not found")
    
    return {"message": "DVD station updated successfully"}

@api_router.delete("/dvd-stations/{station_id}")
async def delete_dvd_station(station_id: str, current_user: User = Depends(get_current_user)):
    # Only VZO can delete stations
    if not has_vzo_full_access(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.dvd_stations.delete_one({"id": station_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="DVD station not found")
    
    return {"message": "DVD station deleted successfully"}

# NEW: Vehicles endpoints
@api_router.get("/vehicles", response_model=List[Vehicle])
async def get_vehicles(current_user: User = Depends(get_current_user)):
    if has_vzo_full_access(current_user):
        vehicles = await db.vehicles.find().to_list(1000)
    else:
        vehicles = await db.vehicles.find({"department": current_user.department}).to_list(1000)
    return [Vehicle(**vehicle) for vehicle in vehicles]

@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(vehicle: Vehicle, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.vehicles.insert_one(vehicle.dict())
    return vehicle

class VehicleUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    license_plate: Optional[str] = None
    department: Optional[str] = None
    year: Optional[int] = None
    technical_inspection_date: Optional[datetime] = None
    technical_inspection_valid_until: Optional[datetime] = None
    last_service_date: Optional[datetime] = None
    next_service_due: Optional[datetime] = None
    service_km: Optional[int] = None
    current_km: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None

@api_router.put("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, vehicle_update: VehicleUpdate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in vehicle_update.dict().items() if v is not None}
    
    result = await db.vehicles.update_one({"id": vehicle_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    return {"message": "Vehicle updated successfully"}

@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.vehicles.delete_one({"id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    return {"message": "Vehicle deleted successfully"}

# NEW: Equipment endpoints
@api_router.get("/equipment", response_model=List[Equipment])
async def get_equipment(current_user: User = Depends(get_current_user)):
    if has_vzo_full_access(current_user):
        equipment = await db.equipment.find().to_list(1000)
    else:
        equipment = await db.equipment.find({"department": current_user.department}).to_list(1000)
    return [Equipment(**eq) for eq in equipment]

@api_router.post("/equipment", response_model=Equipment)
async def create_equipment(equipment: Equipment, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.equipment.insert_one(equipment.dict())
    return equipment

class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    serial_number: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    last_inspection_date: Optional[datetime] = None
    next_inspection_due: Optional[datetime] = None
    condition: Optional[str] = None
    assigned_to_user: Optional[str] = None
    assigned_to_vehicle: Optional[str] = None
    notes: Optional[str] = None

@api_router.put("/equipment/{equipment_id}")
async def update_equipment(equipment_id: str, equipment_update: EquipmentUpdate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in equipment_update.dict().items() if v is not None}
    
    result = await db.equipment.update_one({"id": equipment_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    return {"message": "Equipment updated successfully"}

@api_router.delete("/equipment/{equipment_id}")
async def delete_equipment(equipment_id: str, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.equipment.delete_one({"id": equipment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    return {"message": "Equipment deleted successfully"}

@api_router.get("/locations/active")
async def get_active_locations():
    return list(active_connections.values())

@api_router.get("/hydrants", response_model=List[Hydrant])
async def get_hydrants(current_user: User = Depends(get_current_user)):
    hydrants = await db.hydrants.find().to_list(1000)
    return [Hydrant(**hydrant) for hydrant in hydrants]

@api_router.post("/hydrants", response_model=Hydrant)
async def create_hydrant(hydrant: HydrantCreate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    hydrant_obj = Hydrant(**hydrant.dict(), checked_by=current_user.id)
    await db.hydrants.insert_one(hydrant_obj.dict())
    return hydrant_obj

@api_router.put("/hydrants/{hydrant_id}")
async def update_hydrant(hydrant_id: str, hydrant_update: HydrantUpdate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in hydrant_update.dict().items() if v is not None}
    update_data["last_check"] = datetime.now(timezone.utc)
    update_data["checked_by"] = current_user.id
    
    result = await db.hydrants.update_one({"id": hydrant_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Hydrant not found")
    
    return {"message": "Hydrant updated successfully"}

@api_router.delete("/hydrants/{hydrant_id}")
async def delete_hydrant(hydrant_id: str, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.hydrants.delete_one({"id": hydrant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hydrant not found")
    
    return {"message": "Hydrant deleted successfully"}

@api_router.get("/")
async def root():
    return {"message": "Vatrogasna zajednica API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Mount socket.io
from fastapi import FastAPI
app.mount("/socket.io", socket_app)