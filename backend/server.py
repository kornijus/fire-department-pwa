from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
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
    department: str  # Vatrogasno društvo (1-4)
    role: str = "member"  # member, operative, admin
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    department: str
    role: str = "member"

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
    status: str = "working"  # working, broken, maintenance
    last_check: Optional[datetime] = None
    notes: Optional[str] = None
    images: List[str] = []
    checked_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HydrantCreate(BaseModel):
    latitude: float
    longitude: float
    status: str = "working"
    notes: Optional[str] = None

class HydrantUpdate(BaseModel):
    status: Optional[str] = None
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

# Helper function to check if user has management permissions
def has_hydrant_management_permission(role: str) -> bool:
    management_roles = [
        "zapovjednik", 
        "zamjenik_zapovjednika", 
        "zapovjednistvo",
        "predsjednik"
    ]
    return role in management_roles

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
BASE_LOCATION = (45.1, 15.2)  # Replace with actual coordinates
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
    if not has_hydrant_management_permission(current_user.role):
        raise HTTPException(status_code=403, detail="Access denied")
    
    users = await db.users.find().to_list(1000)
    return [User(**user).dict() for user in users]

@api_router.get("/locations/active")
async def get_active_locations():
    return list(active_connections.values())

@api_router.get("/hydrants", response_model=List[Hydrant])
async def get_hydrants():
    hydrants = await db.hydrants.find().to_list(1000)
    return [Hydrant(**hydrant) for hydrant in hydrants]

@api_router.post("/hydrants", response_model=Hydrant)
async def create_hydrant(hydrant: HydrantCreate, current_user: User = Depends(get_current_user)):
    if not has_hydrant_management_permission(current_user.role):
        raise HTTPException(status_code=403, detail="Access denied")
    
    hydrant_obj = Hydrant(**hydrant.dict(), checked_by=current_user.id)
    await db.hydrants.insert_one(hydrant_obj.dict())
    return hydrant_obj

@api_router.put("/hydrants/{hydrant_id}")
async def update_hydrant(hydrant_id: str, hydrant_update: HydrantUpdate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["operative", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in hydrant_update.dict().items() if v is not None}
    update_data["last_check"] = datetime.now(timezone.utc)
    update_data["checked_by"] = current_user.id
    
    result = await db.hydrants.update_one({"id": hydrant_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Hydrant not found")
    
    return {"message": "Hydrant updated successfully"}

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