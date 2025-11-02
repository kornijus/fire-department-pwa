from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
import socketio
import json
import asyncio
from geopy.distance import geodesic
import base64
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

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
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode='asgi', logger=True, engineio_logger=True)

# Active connections tracking - MUST be defined before event handlers
active_connections: Dict[str, Dict] = {}

# ===== SOCKET.IO EVENT HANDLERS - REGISTER BEFORE socket_app =====
print("🔧 Registering Socket.IO event handlers...")

@sio.event
async def connect(sid, environ):
    print(f"🔌 ========================================")
    print(f"🔌 CLIENT CONNECTED: {sid}")
    print(f"🔌 FROM IP: {environ.get('REMOTE_ADDR')}")
    print(f"🔌 ========================================")
    await sio.emit('connection_success', {'message': 'Successfully connected to server!'}, room=sid)

@sio.event
async def disconnect(sid):
    print(f"❌ Client {sid} disconnected")
    if sid in active_connections:
        del active_connections[sid]
    await sio.emit('user_locations', list(active_connections.values()))

@sio.event
async def test_event(sid, data):
    print(f"🧪 TEST EVENT RECEIVED from {sid}: {data}")
    return {'received': True}

@sio.event
async def location_update(sid, data):
    print(f"📍 ========================================")
    print(f"📍 LOCATION UPDATE EVENT RECEIVED!")
    print(f"📍 SID: {sid}")
    print(f"📍 DATA: {data}")
    print(f"📍 ========================================")
    try:
        user_id = data.get('user_id')
        username = data.get('username', 'Unknown')
        full_name = data.get('full_name', 'Unknown')
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        
        print(f"📍 Location update from {full_name} ({user_id}): {latitude}, {longitude}")
        
        # Check geofencing
        from geopy.distance import geodesic
        base_coords = (46.2508, 16.3755)
        user_coords = (latitude, longitude)
        distance = geodesic(base_coords, user_coords).km
        within_fence = distance <= 10
        status = "active" if within_fence else "inactive"
        
        # Update active connections
        active_connections[sid] = {
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "latitude": latitude,
            "longitude": longitude,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        print(f"✅ Updated connections, now {len(active_connections)} active users")
        
        # Send confirmation
        await sio.emit('location_received', {
            'message': f'Location received for {full_name}',
            'user_count': len(active_connections)
        }, room=sid)
        
        # Broadcast to all
        await sio.emit('user_locations', list(active_connections.values()))
        print(f"✅ Broadcasted user_locations to all clients")
        
    except Exception as e:
        print(f"❌ Error handling location update: {e}")
        import traceback
        traceback.print_exc()

@sio.event
async def ping_user(sid, data):
    target_user_id = data.get('target_user_id')
    from_user_id = data.get('from_user_id')
    message = data.get('message', 'Ping!')
    
    for conn_sid, conn_data in active_connections.items():
        if conn_data.get('user_id') == target_user_id:
            await sio.emit('ping_received', {
                'from_user_id': from_user_id,
                'message': message
            }, room=conn_sid)
            break

print("✅ Socket.IO event handlers registered!")
# ===== END OF SOCKET.IO EVENT HANDLERS =====

# Create the main app
app = FastAPI()

# Socket.IO app - created AFTER event handlers are registered
socket_app = socketio.ASGIApp(sio, app)

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
    is_operational: bool = False  # NEW: Da li je član operativac (za uzbune, intervencije)
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
    is_operational: bool = False  # NEW: Da li je član operativac

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

# HTTP-based location tracking (alternative to WebSocket)
@api_router.post("/locations/update")
async def update_location(data: dict, current_user: User = Depends(get_current_user)):
    """Update user location via HTTP POST"""
    try:
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        
        print(f"📍 HTTP Location update from {current_user.full_name}: {latitude}, {longitude}")
        
        # Check geofencing
        from geopy.distance import geodesic
        base_coords = (46.2508, 16.3755)
        user_coords = (latitude, longitude)
        distance = geodesic(base_coords, user_coords).km
        within_fence = distance <= 10
        status = "active" if within_fence else "inactive"
        
        # Save to database
        location_data = {
            "user_id": current_user.id,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": datetime.now(timezone.utc),
            "is_active": within_fence,
            "status": status
        }
        
        await db.locations.insert_one(location_data)
        
        # Store in memory cache
        active_connections[current_user.id] = {
            "user_id": current_user.id,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "latitude": latitude,
            "longitude": longitude,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        print(f"✅ Location saved, {len(active_connections)} active users")
        
        return {"success": True, "message": "Location updated", "user_count": len(active_connections)}
        
    except Exception as e:
        print(f"❌ Error updating location: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/locations/active")
async def get_active_locations(current_user: User = Depends(get_current_user)):
    """Get all active user locations"""
    # Remove stale locations (older than 60 seconds)
    cutoff_time = datetime.now(timezone.utc) - timedelta(seconds=60)
    
    active_list = []
    stale_keys = []
    
    for user_id, loc_data in active_connections.items():
        try:
            loc_time = datetime.fromisoformat(loc_data['timestamp'].replace('Z', '+00:00'))
            if loc_time > cutoff_time:
                active_list.append(loc_data)
            else:
                stale_keys.append(user_id)
        except:
            stale_keys.append(user_id)
    
    # Remove stale entries
    for key in stale_keys:
        del active_connections[key]
    
    print(f"📥 Returning {len(active_list)} active users")
    return active_list

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

# NEW: Event model (for training, insurance checks, inspections, etc.)
class Event(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    event_type: str  # training, insurance, medical_check, equipment_check, drill
    date: datetime
    department: str  # which DVD or VZO
    participants: List[str] = []  # list of user IDs
    description: Optional[str] = None
    location: Optional[str] = None
    created_by: str  # user ID who created the event
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Message model (for group communication)
class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message_type: str  # alert, general, drill, event
    title: str
    content: str
    sent_by: str  # user ID
    sent_by_name: str  # user full name
    sent_to_departments: List[str] = []  # list of departments or "all"
    priority: str = "normal"  # urgent, normal, low
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Chat message model (for private and group communication)
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_type: str  # private or group
    sender_id: str
    sender_name: str
    recipient_id: Optional[str] = None  # for private messages
    group_id: Optional[str] = None  # DVD department name for group chat
    content: str
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW: Intervention/Incident Report model
class Intervention(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    intervention_type: str  # fire, flood, accident, rescue, medical, other
    date: datetime
    location: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    departments: List[str] = []  # which DVDs responded (can be multiple)
    participants: List[str] = []  # list of user IDs
    vehicles_used: List[str] = []  # list of vehicle IDs
    description: str
    actions_taken: Optional[str] = None
    damage_assessment: Optional[str] = None
    casualties: Optional[str] = None
    images: List[str] = []  # base64 encoded images
    created_by: str  # user ID
    created_by_name: str
    status: str = "completed"  # in_progress, completed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class UserUpdate(BaseModel):
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    is_vzo_member: Optional[bool] = None
    is_operational: Optional[bool] = None  # NEW: Da li je član operativac
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

# NEW: Events endpoints (školovanja, osiguranja, provjere)
@api_router.get("/events", response_model=List[Event])
async def get_events(current_user: User = Depends(get_current_user)):
    if has_vzo_full_access(current_user):
        events = await db.events.find().to_list(1000)
    else:
        events = await db.events.find({"department": current_user.department}).to_list(1000)
    return [Event(**event) for event in events]

@api_router.post("/events", response_model=Event)
async def create_event(event: Event, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    event.created_by = current_user.id
    await db.events.insert_one(event.dict())
    return event

class EventUpdate(BaseModel):
    title: Optional[str] = None
    event_type: Optional[str] = None
    date: Optional[datetime] = None
    department: Optional[str] = None
    participants: Optional[List[str]] = None
    description: Optional[str] = None
    location: Optional[str] = None

@api_router.put("/events/{event_id}")
async def update_event(event_id: str, event_update: EventUpdate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in event_update.dict().items() if v is not None}
    
    result = await db.events.update_one({"id": event_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {"message": "Event updated successfully"}

@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.events.delete_one({"id": event_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {"message": "Event deleted successfully"}

# NEW: Messages endpoints (grupne poruke)
@api_router.get("/messages", response_model=List[Message])
async def get_messages(current_user: User = Depends(get_current_user)):
    # Return messages sent to user's department or to "all"
    messages = await db.messages.find({
        "$or": [
            {"sent_to_departments": current_user.department},
            {"sent_to_departments": "all"}
        ]
    }).to_list(1000)
    return [Message(**msg) for msg in messages]

@api_router.post("/messages", response_model=Message)
async def send_message(message: Message, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    message.sent_by = current_user.id
    message.sent_by_name = current_user.full_name
    await db.messages.insert_one(message.dict())
    
    # Broadcast message via WebSocket
    await sio.emit('new_message', message.dict())
    
    return message

# NEW: Intervention/Incident Reports endpoints
@api_router.get("/interventions", response_model=List[Intervention])
async def get_interventions(current_user: User = Depends(get_current_user)):
    if has_vzo_full_access(current_user):
        interventions = await db.interventions.find().to_list(1000)
    else:
        # Show interventions where user's department is in the departments array
        interventions = await db.interventions.find({"departments": current_user.department}).to_list(1000)
    return [Intervention(**intervention) for intervention in interventions]

@api_router.post("/interventions", response_model=Intervention)
async def create_intervention(intervention: Intervention, current_user: User = Depends(get_current_user)):
    intervention.created_by = current_user.id
    intervention.created_by_name = current_user.full_name
    intervention.created_at = datetime.now(timezone.utc)
    await db.interventions.insert_one(intervention.dict())
    return intervention

class InterventionUpdate(BaseModel):
    intervention_type: Optional[str] = None
    date: Optional[datetime] = None
    location: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    departments: Optional[List[str]] = None
    participants: Optional[List[str]] = None
    vehicles_used: Optional[List[str]] = None
    description: Optional[str] = None
    actions_taken: Optional[str] = None
    damage_assessment: Optional[str] = None
    casualties: Optional[str] = None
    images: Optional[List[str]] = None
    status: Optional[str] = None

@api_router.put("/interventions/{intervention_id}")
async def update_intervention(intervention_id: str, intervention_update: InterventionUpdate, current_user: User = Depends(get_current_user)):
    update_data = {k: v for k, v in intervention_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    result = await db.interventions.update_one({"id": intervention_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Intervention not found")
    
    return {"message": "Intervention updated successfully"}

@api_router.delete("/interventions/{intervention_id}")
async def delete_intervention(intervention_id: str, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.interventions.delete_one({"id": intervention_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Intervention not found")
    
    return {"message": "Intervention deleted successfully"}

# NEW: Chat/Communication endpoints
@api_router.post("/chat/send", response_model=ChatMessage)
async def send_chat_message(message: ChatMessage, current_user: User = Depends(get_current_user)):
    """Send a private or group chat message"""
    message.sender_id = current_user.id
    message.sender_name = current_user.full_name
    message.created_at = datetime.now(timezone.utc)
    
    await db.chat_messages.insert_one(message.dict())
    
    # Broadcast via WebSocket for real-time
    await sio.emit('new_chat_message', message.dict())
    
    return message

@api_router.get("/chat/private/{user_id}", response_model=List[ChatMessage])
async def get_private_chat(user_id: str, current_user: User = Depends(get_current_user)):
    """Get private chat messages between current user and specified user"""
    # Private chat primarily for operational members
    if not current_user.is_operational:
        raise HTTPException(status_code=403, detail="Privatni chat je dostupan operativnim članovima")
    
    messages = await db.chat_messages.find({
        "chat_type": "private",
        "$or": [
            {"sender_id": current_user.id, "recipient_id": user_id},
            {"sender_id": user_id, "recipient_id": current_user.id}
        ]
    }).sort("created_at", 1).to_list(1000)
    
    # Mark messages as read
    await db.chat_messages.update_many(
        {"sender_id": user_id, "recipient_id": current_user.id, "read": False},
        {"$set": {"read": True}}
    )
    
    return [ChatMessage(**msg) for msg in messages]

@api_router.get("/chat/group/{group_type}", response_model=List[ChatMessage])
async def get_group_chat(group_type: str, current_user: User = Depends(get_current_user)):
    """Get group chat messages - group_type: 'operational' or 'all'"""
    # For operational chat - only operational members
    if group_type == 'operational' and not current_user.is_operational:
        raise HTTPException(status_code=403, detail="Samo operativni članovi imaju pristup")
    
    # Group ID format: "DVD_Name_operational" or "DVD_Name_all"
    group_id = f"{current_user.department}_{group_type}"
    
    messages = await db.chat_messages.find({
        "chat_type": "group",
        "group_id": group_id
    }).sort("created_at", 1).to_list(1000)
    
    return [ChatMessage(**msg) for msg in messages]

@api_router.get("/chat/unread-count")
async def get_unread_count(current_user: User = Depends(get_current_user)):
    """Get count of unread messages"""
    private_count = await db.chat_messages.count_documents({
        "chat_type": "private",
        "recipient_id": current_user.id,
        "read": False
    })
    
    return {"unread_private": private_count}

@api_router.get("/chat/conversations")
async def get_conversations(current_user: User = Depends(get_current_user)):
    """Get list of users current user has chatted with"""
    # Get unique user IDs from sent and received messages
    pipeline = [
        {
            "$match": {
                "chat_type": "private",
                "$or": [
                    {"sender_id": current_user.id},
                    {"recipient_id": current_user.id}
                ]
            }
        },
        {
            "$group": {
                "_id": {
                    "$cond": [
                        {"$eq": ["$sender_id", current_user.id]},
                        "$recipient_id",
                        "$sender_id"
                    ]
                },
                "last_message": {"$last": "$$ROOT"}
            }
        },
        {"$sort": {"last_message.created_at": -1}}
    ]
    
    conversations = await db.chat_messages.aggregate(pipeline).to_list(100)
    
    return conversations

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

# ===== PDF GENERATORS =====

def create_pdf_header(canvas, doc, title: str, department: str):
    """Helper function to create PDF header with logo and title"""
    canvas.saveState()
    # Title
    canvas.setFont('Helvetica-Bold', 16)
    canvas.drawCentredString(A4[0]/2, A4[1] - 2*cm, title)
    
    # Department
    canvas.setFont('Helvetica', 12)
    canvas.drawCentredString(A4[0]/2, A4[1] - 2.7*cm, department)
    
    # Date
    canvas.setFont('Helvetica', 10)
    canvas.drawCentredString(A4[0]/2, A4[1] - 3.2*cm, 
                            f"Datum generiranja: {datetime.now().strftime('%d.%m.%Y.')}")
    
    canvas.restoreState()

@api_router.get("/pdf/evidencijski-list/{department}")
async def generate_evidencijski_list_pdf(
    department: str,
    current_user: User = Depends(get_current_user)
):
    """Generate evidencijski list članova PDF for a specific department"""
    
    # Fetch members of the department
    if department == "VZO":
        # VZO gets all members
        members_cursor = db.users.find({})
    else:
        members_cursor = db.users.find({"department": department})
    
    members = await members_cursor.to_list(length=None)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, 
                           topMargin=4*cm, bottomMargin=2*cm,
                           leftMargin=1.5*cm, rightMargin=1.5*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    dept_name = "VZO Gornji Kneginec" if department == "VZO" else department.replace('_', ' ')
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(f"<b>EVIDENCIJSKI LIST ČLANOVA</b>", title_style))
    elements.append(Paragraph(f"<b>{dept_name}</b>", title_style))
    elements.append(Paragraph(f"Datum: {datetime.now().strftime('%d.%m.%Y.')}", 
                             ParagraphStyle('Date', parent=styles['Normal'], alignment=TA_CENTER)))
    elements.append(Spacer(1, 1*cm))
    
    # Table data
    data = [['Rb.', 'Ime i Prezime', 'Uloga', 'Liječnički do', 'Kontakt', 'Specijalnosti']]
    
    for idx, member in enumerate(members, 1):
        medical_date = ''
        if member.get('medical_exam_valid_until'):
            exam_date = member['medical_exam_valid_until']
            if isinstance(exam_date, str):
                medical_date = datetime.fromisoformat(exam_date).strftime('%d.%m.%Y.')
            elif isinstance(exam_date, datetime):
                medical_date = exam_date.strftime('%d.%m.%Y.')
        
        certifications = ', '.join(member.get('certifications', [])[:2]) if member.get('certifications') else '-'
        
        data.append([
            str(idx),
            member.get('full_name', ''),
            member.get('role', '').replace('_', ' '),
            medical_date or '-',
            member.get('phone', '-'),
            certifications
        ])
    
    # Create table
    table = Table(data, colWidths=[1*cm, 4.5*cm, 3.5*cm, 2.5*cm, 3*cm, 4*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dc2626')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    elements.append(table)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"evidencijski_list_{department}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/pdf/oprema-vozilo/{department}")
async def generate_oprema_vozilo_pdf(
    department: str,
    current_user: User = Depends(get_current_user)
):
    """Generate lista opreme vozilo PDF"""
    
    # Fetch vehicles and equipment
    if department == "VZO":
        vehicles_cursor = db.vehicles.find({})
    else:
        vehicles_cursor = db.vehicles.find({"department": department})
    
    vehicles = await vehicles_cursor.to_list(length=None)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           topMargin=4*cm, bottomMargin=2*cm,
                           leftMargin=1.5*cm, rightMargin=1.5*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    dept_name = "VZO Gornji Kneginec" if department == "VZO" else department.replace('_', ' ')
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(f"<b>LISTA OPREME - VOZILA</b>", title_style))
    elements.append(Paragraph(f"<b>{dept_name}</b>", title_style))
    elements.append(Paragraph(f"Datum: {datetime.now().strftime('%d.%m.%Y.')}", 
                             ParagraphStyle('Date', parent=styles['Normal'], alignment=TA_CENTER)))
    elements.append(Spacer(1, 1*cm))
    
    # For each vehicle, create a table
    for vehicle in vehicles:
        # Vehicle header
        vehicle_style = ParagraphStyle(
            'VehicleHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=5
        )
        elements.append(Paragraph(f"<b>Vozilo: {vehicle.get('name', '')} ({vehicle.get('license_plate', '')})</b>", 
                                 vehicle_style))
        
        # Get equipment for this vehicle
        equipment_cursor = db.equipment.find({"assigned_to_vehicle": vehicle['id']})
        equipment_list = await equipment_cursor.to_list(length=None)
        
        if equipment_list:
            # Table data
            data = [['Rb.', 'Naziv opreme', 'Tip', 'Serijski broj', 'Stanje', 'Sljedeća provjera']]
            
            for idx, item in enumerate(equipment_list, 1):
                next_inspection = ''
                if item.get('next_inspection_due'):
                    inspection_date = item['next_inspection_due']
                    if isinstance(inspection_date, str):
                        next_inspection = datetime.fromisoformat(inspection_date).strftime('%d.%m.%Y.')
                    elif isinstance(inspection_date, datetime):
                        next_inspection = inspection_date.strftime('%d.%m.%Y.')
                
                data.append([
                    str(idx),
                    item.get('name', ''),
                    item.get('type', ''),
                    item.get('serial_number', '-'),
                    item.get('condition', ''),
                    next_inspection or '-'
                ])
            
            # Create table
            table = Table(data, colWidths=[1*cm, 4*cm, 3*cm, 3*cm, 2*cm, 2.5*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
            ]))
            
            elements.append(table)
        else:
            elements.append(Paragraph("<i>Nema zadužene opreme na ovom vozilu</i>", styles['Normal']))
        
        elements.append(Spacer(1, 0.5*cm))
    
    if not vehicles:
        elements.append(Paragraph("<i>Nema evidentirani vozila</i>", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"oprema_vozilo_{department}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/pdf/oprema-spremiste/{department}")
async def generate_oprema_spremiste_pdf(
    department: str,
    current_user: User = Depends(get_current_user)
):
    """Generate lista opreme spremište/dom PDF"""
    
    # Fetch equipment not assigned to vehicles or users (in storage)
    if department == "VZO":
        equipment_cursor = db.equipment.find({
            "$or": [
                {"assigned_to_vehicle": None},
                {"assigned_to_user": None}
            ]
        })
    else:
        equipment_cursor = db.equipment.find({
            "department": department,
            "$or": [
                {"assigned_to_vehicle": None},
                {"assigned_to_user": None}
            ]
        })
    
    equipment_list = await equipment_cursor.to_list(length=None)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           topMargin=4*cm, bottomMargin=2*cm,
                           leftMargin=1.5*cm, rightMargin=1.5*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    dept_name = "VZO Gornji Kneginec" if department == "VZO" else department.replace('_', ' ')
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(f"<b>LISTA OPREME - DOM/SPREMIŠTE</b>", title_style))
    elements.append(Paragraph(f"<b>{dept_name}</b>", title_style))
    elements.append(Paragraph(f"Datum: {datetime.now().strftime('%d.%m.%Y.')}", 
                             ParagraphStyle('Date', parent=styles['Normal'], alignment=TA_CENTER)))
    elements.append(Spacer(1, 1*cm))
    
    # Table data
    data = [['Rb.', 'Naziv opreme', 'Tip', 'Serijski broj', 'Lokacija', 'Stanje', 'Sljedeća provjera']]
    
    for idx, item in enumerate(equipment_list, 1):
        next_inspection = ''
        if item.get('next_inspection_due'):
            inspection_date = item['next_inspection_due']
            if isinstance(inspection_date, str):
                next_inspection = datetime.fromisoformat(inspection_date).strftime('%d.%m.%Y.')
            elif isinstance(inspection_date, datetime):
                next_inspection = inspection_date.strftime('%d.%m.%Y.')
        
        data.append([
            str(idx),
            item.get('name', ''),
            item.get('type', ''),
            item.get('serial_number', '-'),
            item.get('location', '-'),
            item.get('condition', ''),
            next_inspection or '-'
        ])
    
    # Create table
    table = Table(data, colWidths=[1*cm, 3.5*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2*cm, 2.5*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c2d12')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightgoldenrodyellow),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]))
    
    elements.append(table)
    
    if not equipment_list:
        elements.append(Paragraph("<i>Nema opreme u spremištu</i>", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"oprema_spremiste_{department}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/pdf/osobno-zaduzenje/{user_id}")
async def generate_osobno_zaduzenje_pdf(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate list osobnog zaduženja PDF for a specific member"""
    
    # Fetch member
    member = await db.users.find_one({"id": user_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Fetch equipment assigned to this member
    equipment_cursor = db.equipment.find({"assigned_to_user": user_id})
    equipment_list = await equipment_cursor.to_list(length=None)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           topMargin=3*cm, bottomMargin=2*cm,
                           leftMargin=2*cm, rightMargin=2*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(f"<b>LIST OSOBNOG ZADUŽENJA</b>", title_style))
    elements.append(Paragraph(f"<b>VZO Gornji Kneginec</b>", title_style))
    elements.append(Spacer(1, 0.8*cm))
    
    # Member info
    info_style = ParagraphStyle('MemberInfo', parent=styles['Normal'], fontSize=11, spaceAfter=5)
    elements.append(Paragraph(f"<b>Ime i prezime:</b> {member.get('full_name', '')}", info_style))
    elements.append(Paragraph(f"<b>Društvo:</b> {member.get('department', '').replace('_', ' ')}", info_style))
    elements.append(Paragraph(f"<b>Uloga:</b> {member.get('role', '').replace('_', ' ')}", info_style))
    elements.append(Paragraph(f"<b>Datum izdavanja:</b> {datetime.now().strftime('%d.%m.%Y.')}", info_style))
    elements.append(Spacer(1, 0.8*cm))
    
    # Equipment table
    if equipment_list:
        data = [['Rb.', 'Naziv opreme', 'Tip', 'Serijski broj', 'Stanje', 'Datum zaduženja']]
        
        for idx, item in enumerate(equipment_list, 1):
            created_at = ''
            if item.get('created_at'):
                creation_date = item['created_at']
                if isinstance(creation_date, str):
                    created_at = datetime.fromisoformat(creation_date).strftime('%d.%m.%Y.')
                elif isinstance(creation_date, datetime):
                    created_at = creation_date.strftime('%d.%m.%Y.')
            
            data.append([
                str(idx),
                item.get('name', ''),
                item.get('type', ''),
                item.get('serial_number', '-'),
                item.get('condition', ''),
                created_at or '-'
            ])
        
        # Create table
        table = Table(data, colWidths=[1*cm, 4.5*cm, 3*cm, 3*cm, 2*cm, 2.5*cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dc2626')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        
        elements.append(table)
    else:
        elements.append(Paragraph("<i>Nema zadužene opreme</i>", styles['Normal']))
    
    # Signature section
    elements.append(Spacer(1, 2*cm))
    signature_style = ParagraphStyle('Signature', parent=styles['Normal'], fontSize=10)
    elements.append(Paragraph("_" * 40, signature_style))
    elements.append(Paragraph(f"Potpis člana: {member.get('full_name', '')}", signature_style))
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph("_" * 40, signature_style))
    elements.append(Paragraph("Potpis zapovjednika", signature_style))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"osobno_zaduzenje_{member.get('full_name', '').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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

# Socket.IO is already wrapped in socket_app via socketio.ASGIApp(sio, app)
# No need to mount it separately - this was causing the routing issue!