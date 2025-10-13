import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { io } from 'socket.io-client';
import L from 'leaflet';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Alert, AlertDescription } from './components/ui/alert';
import { Switch } from './components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import './App.css';

// Fix Leaflet default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom icons
const firefighterIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2917/2917995.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// NEW: Different hydrant icons based on type (Blue for nadzemni, Red for podzemni)
const nadzemniHydrantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6">
      <circle cx="12" cy="12" r="10" stroke="#1e40af" stroke-width="2"/>
      <circle cx="12" cy="12" r="6" fill="#60a5fa"/>
      <text x="12" y="17" text-anchor="middle" fill="white" font-size="10" font-weight="bold">H</text>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

const podzemniHydrantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64=' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#dc2626">
      <circle cx="12" cy="12" r="10" stroke="#991b1b" stroke-width="2"/>
      <circle cx="12" cy="12" r="6" fill="#f87171"/>
      <text x="12" y="17" text-anchor="middle" fill="white" font-size="10" font-weight="bold">H</text>
    </svg>
  `),
  iconSize: [24, 24], 
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// NEW: DVD Station icon
const dvdStationIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64=' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="#dc2626">
      <rect x="5" y="15" width="30" height="20" rx="2" fill="#dc2626" stroke="#991b1b" stroke-width="2"/>
      <rect x="8" y="18" width="4" height="3" fill="white"/>
      <rect x="14" y="18" width="4" height="3" fill="white"/>
      <rect x="20" y="18" width="4" height="3" fill="white"/>
      <rect x="26" y="18" width="4" height="3" fill="white"/>
      <polygon points="20,5 10,15 30,15" fill="#991b1b"/>
      <circle cx="20" cy="10" r="2" fill="white"/>
      <text x="20" y="30" text-anchor="middle" fill="white" font-size="8" font-weight="bold">DVD</text>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

// Auth Context
const AuthContext = React.createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserProfile();
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`${API}/me`);
      setUser(response.data);
    } catch (error) {
      logout();
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API}/login`, { username, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const register = async (userData) => {
    try {
      await axios.post(`${API}/register`, userData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Registration failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Login Component
const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    full_name: '',
    department: '',
    role: '',
    is_vzo_member: false  // NEW: VZO membership flag
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const result = await login(formData.username, formData.password);
        if (!result.success) {
          setError(result.error);
        }
      } else {
        const result = await register(formData);
        if (result.success) {
          setIsLogin(true);
          setError('');
          alert('Registracija uspješna! Molimo prijavite se.');
        } else {
          setError(result.error);
        }
      }
    } catch (error) {
      setError('Došlo je do greške');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center space-y-4">
            <img 
              src="https://customer-assets.emergentagent.com/job_fire-community/artifacts/mafhx4an_image.png" 
              alt="Vatrogasna zajednica općine Gornji Kneginec" 
              className="w-20 h-20 object-contain"
            />
            <div className="text-center">
              <h1 className="text-lg font-bold text-red-700">Vatrogasna zajednica općine</h1>
              <h2 className="text-xl font-bold text-red-800">GORNJI KNEGINEC</h2>
              <p className="text-sm text-gray-600 mt-2">Osnovana 1993.</p>
            </div>
          </div>
          <CardTitle className="text-center text-xl font-bold text-red-700 mt-4">
            {isLogin ? 'Prijava' : 'Registracija'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Korisničko ime"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            
            {!isLogin && (
              <>
                <div>
                  <Input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="Puno ime"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="vzo_member"
                    checked={formData.is_vzo_member}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, is_vzo_member: checked, role: '', department: checked ? 'VZO' : '' });
                    }}
                  />
                  <label htmlFor="vzo_member" className="text-sm font-medium">
                    Član VZO-a
                  </label>
                </div>
                
                {!formData.is_vzo_member && (
                  <div>
                    <Select onValueChange={(value) => setFormData({ ...formData, department: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Vatrogasno društvo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                        <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                        <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                        <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div>
                  <Select onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Uloga" />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.is_vzo_member ? (
                        <>
                          <SelectItem value="predsjednik_vzo">Predsjednik VZO-a</SelectItem>
                          <SelectItem value="zamjenik_predsjednika_vzo">Zamjenik predsjednika VZO-a</SelectItem>
                          <SelectItem value="tajnik_vzo">Tajnik VZO-a</SelectItem>
                          <SelectItem value="zapovjednik_vzo">Zapovjednik VZO-a</SelectItem>
                          <SelectItem value="zamjenik_zapovjednika_vzo">Zamjenik zapovjednika VZO-a</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="clan_bez_funkcije">Član bez funkcije</SelectItem>
                          <SelectItem value="predsjednik">Predsjednik</SelectItem>
                          <SelectItem value="tajnik">Tajnik</SelectItem>
                          <SelectItem value="zapovjednik">Zapovjednik</SelectItem>
                          <SelectItem value="zamjenik_zapovjednika">Zamjenik zapovjednika</SelectItem>
                          <SelectItem value="spremistar">Spremistar</SelectItem>
                          <SelectItem value="blagajnik">Blagajnik</SelectItem>
                          <SelectItem value="upravni_odbor">Upravni odbor</SelectItem>
                          <SelectItem value="nadzorni_odbor">Nadzorni odbor</SelectItem>
                          <SelectItem value="zapovjednistvo">Zapovjedništvo</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            
            <div>
              <Input
                type="password"
                placeholder="Lozinka"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={loading}
            >
              {loading ? 'Učitavanje...' : (isLogin ? 'Prijavite se' : 'Registrirajte se')}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-red-600 hover:text-red-700 text-sm"
              >
                {isLogin ? 'Nemate račun? Registrirajte se' : 'Imate račun? Prijavite se'}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// NEW: Map click handler component
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

// Main Dashboard Component
const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeUsers, setActiveUsers] = useState([]);
  const [hydrants, setHydrants] = useState([]);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isAddingHydrant, setIsAddingHydrant] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [dvdStations, setDvdStations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const watchId = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('user_locations', (locations) => {
      setActiveUsers(locations);
    });

    newSocket.on('ping_received', (data) => {
      alert(`Ping od ${data.from_user_id}: ${data.message}`);
    });

    // Fetch hydrants and DVD stations
    fetchHydrants();
    fetchDvdStations();

    return () => {
      if (watchId.current) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (gpsEnabled && user) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
  }, [gpsEnabled, user]);

  // Fetch data when user logs in
  useEffect(() => {
    if (user) {
      fetchDvdStations();
      fetchVehicles();
      fetchEquipment();
    }
  }, [user]);

  const fetchHydrants = async () => {
    try {
      const response = await axios.get(`${API}/hydrants`);
      setHydrants(response.data);
    } catch (error) {
      console.error('Error fetching hydrants:', error);
    }
  };

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      alert('GPS nije podržan u vašem pregledniku');
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        
        setUserLocation(location);
        
        if (socket && user) {
          socket.emit('location_update', {
            user_id: user.id,
            ...location
          });
        }
      },
      (error) => {
        console.error('GPS error:', error);
        alert('Greška pri dohvaćanju GPS pozicije');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 10000
      }
    );
  };

  const stopLocationTracking = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  // Helper function to format department name
  const formatDepartmentName = (department) => {
    if (department === 'VZO') return 'VZO Gornji Kneginec';
    const departmentNames = {
      'DVD_Kneginec_Gornji': 'DVD Kneginec Gornji',
      'DVD_Donji_Kneginec': 'DVD Donji Kneginec', 
      'DVD_Varazdinbreg': 'DVD Varaždinbreg',
      'DVD_Luzan_Biskupecki': 'DVD Lužan Biškupečki'
    };
    return departmentNames[department] || department;
  };

  // Helper function to format role name
  const formatRoleName = (role) => {
    const roleNames = {
      'clan_bez_funkcije': 'Član bez funkcije',
      'predsjednik': 'Predsjednik',
      'tajnik': 'Tajnik',
      'zapovjednik': 'Zapovjednik',
      'zamjenik_zapovjednika': 'Zamjenik zapovjednika',
      'spremistar': 'Spremistar',
      'blagajnik': 'Blagajnik',
      'upravni_odbor': 'Upravni odbor',
      'nadzorni_odbor': 'Nadzorni odbor',
      'zapovjednistvo': 'Zapovjedništvo',
      // VZO roles
      'predsjednik_vzo': 'Predsjednik VZO-a',
      'zamjenik_predsjednika_vzo': 'Zamjenik predsjednika VZO-a',
      'tajnik_vzo': 'Tajnik VZO-a',
      'zapovjednik_vzo': 'Zapovjednik VZO-a',
      'zamjenik_zapovjednika_vzo': 'Zamjenik zapovjednika VZO-a'
    };
    return roleNames[role] || role;
  };

  // Helper function to check if user has management permissions
  const hasManagementPermission = (userRole, isVzoMember) => {
    if (isVzoMember) {
      const vzoRoles = ["predsjednik_vzo", "tajnik_vzo", "zapovjednik_vzo", "zamjenik_zapovjednika_vzo"];
      return vzoRoles.includes(userRole);
    }
    
    const managementRoles = [
      "zapovjednik", "zamjenik_zapovjednika", "zapovjednistvo", "predsjednik",
      "tajnik", "spremistar", "blagajnik", "upravni_odbor", "nadzorni_odbor"
    ];
    return managementRoles.includes(userRole);
  };

  const pingUser = (targetUserId) => {
    if (socket && user) {
      socket.emit('ping_user', {
        target_user_id: targetUserId,
        from_user_id: user.id
      });
    }
  };

  // NEW: Handle map click for adding hydrants
  const handleMapClick = (latlng) => {
    if (isAddingHydrant && hasManagementPermission(user?.role, user?.is_vzo_member)) {
      const confirmed = window.confirm(
        `Dodati hidrant na poziciju:\nŠirina: ${latlng.lat.toFixed(6)}\nDužina: ${latlng.lng.toFixed(6)}?`
      );
      
      if (confirmed) {
        // Open add hydrant dialog with coordinates
        addHydrantFromMap(latlng.lat, latlng.lng);
      }
      setIsAddingHydrant(false);
    }
  };

  const addHydrantFromMap = async (lat, lng) => {
    const address = prompt('Adresa hidranta:', '');
    const tip = prompt('Tip hidranta (podzemni/nadzemni):', 'nadzemni');
    const status = prompt('Status (working/broken/maintenance):', 'working');
    const notes = prompt('Napomene (opcionalno):');
    
    if (tip && status) {
      await addHydrant(lat, lng, status, tip, address || '', notes || '');
    }
  };

  const addHydrant = async (lat, lng, status, tip_hidranta, address, notes, images = []) => {
    try {
      await axios.post(`${API}/hydrants`, {
        latitude: lat,
        longitude: lng,
        status,
        tip_hidranta,
        address,
        notes,
        images
      });
      fetchHydrants();
    } catch (error) {
      console.error('Error adding hydrant:', error);
    }
  };

  const updateHydrant = async (hydrantId, status, tip_hidranta, address, notes, images) => {
    try {
      await axios.put(`${API}/hydrants/${hydrantId}`, {
        status,
        tip_hidranta,
        address,
        notes,
        images
      });
      fetchHydrants();
    } catch (error) {
      console.error('Error updating hydrant:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setAllUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const updateUser = async (userId, updates) => {
    try {
      await axios.put(`${API}/users/${userId}`, updates);
      fetchAllUsers();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const deleteHydrant = async (hydrantId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovaj hidrant?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/hydrants/${hydrantId}`);
        fetchHydrants();
      } catch (error) {
        console.error('Error deleting hydrant:', error);
      }
    }
  };

  const fetchDvdStations = async () => {
    try {
      console.log('Fetching DVD stations...');
      const response = await axios.get(`${API}/dvd-stations`);
      console.log('DVD stations received:', response.data);
      setDvdStations(response.data);
    } catch (error) {
      console.error('Error fetching DVD stations:', error);
    }
  };

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`);
      setVehicles(response.data);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const fetchEquipment = async () => {
    try {
      const response = await axios.get(`${API}/equipment`);
      setEquipment(response.data);
    } catch (error) {
      console.error('Error fetching equipment:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-red-600 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img 
              src="https://customer-assets.emergentagent.com/job_fire-community/artifacts/mafhx4an_image.png" 
              alt="VZO Gornji Kneginec" 
              className="w-12 h-12 object-contain bg-white rounded-full p-1"
            />
            <div>
              <h1 className="text-xl font-bold">Vatrogasna Zajednica Općine</h1>
              <p className="text-sm opacity-90">Gornji Kneginec</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.full_name}</div>
              <div className="text-xs opacity-90">{formatRoleName(user?.role)}</div>
              <div className="text-xs opacity-75">{formatDepartmentName(user?.department)}</div>
              {user?.is_vzo_member && (
                <Badge className="bg-yellow-500 text-black text-xs mt-1">VZO</Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              Odjava
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4">
        <Tabs defaultValue="map" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="map">Karta</TabsTrigger>
            <TabsTrigger value="members">Članovi</TabsTrigger>
            <TabsTrigger value="hydrants">Hidranti</TabsTrigger>
            <TabsTrigger value="vehicles">Vozila</TabsTrigger>
            <TabsTrigger value="equipment">Oprema</TabsTrigger>
            {(user?.is_vzo_member && hasManagementPermission(user?.role, user?.is_vzo_member)) && (
              <TabsTrigger value="admin">Administracija</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Live Mapa Hidrantske Mreže</CardTitle>
                  <div className="flex items-center space-x-4">
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <>
                        <Button
                          onClick={() => setIsAddingHydrant(!isAddingHydrant)}
                          className={isAddingHydrant ? 'bg-green-600' : 'bg-blue-600'}
                        >
                          {isAddingHydrant ? 'Odustani' : 'Dodaj Hidrant'}
                        </Button>
                        <AddHydrantDialog onAdd={addHydrant} />
                      </>
                    )}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm">GPS Praćenje:</label>
                      <Switch
                        checked={gpsEnabled}
                        onCheckedChange={setGpsEnabled}
                      />
                    </div>
                  </div>
                </div>
                {isAddingHydrant && (
                  <Alert className="bg-blue-50 border-blue-200">
                    <AlertDescription>Kliknite na kartu za dodavanje novog hidranta</AlertDescription>
                  </Alert>
                )}
              </CardHeader>
              <CardContent>
                <div className="h-96 rounded-lg overflow-hidden border">
                  <MapContainer
                    center={[46.2508, 16.3755]}  // Gornji Kneginec coordinates (corrected)
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {/* Map click handler for adding hydrants */}
                    <MapClickHandler onMapClick={handleMapClick} />
                    
                    {/* DVD Stations */}
                    {dvdStations.map((station) => (
                      <Marker
                        key={station.id}
                        position={[station.latitude, station.longitude]}
                        icon={dvdStationIcon}
                      >
                        <Popup>
                          <div className="p-2">
                            <h3 className="font-bold text-lg text-red-700">{station.name}</h3>
                            <p><strong>Adresa:</strong> {station.address}</p>
                            <p><strong>Telefon:</strong> {station.contact_phone}</p>
                            {station.contact_email && <p><strong>Email:</strong> {station.contact_email}</p>}
                            <p><strong>Osnovano:</strong> {station.established_year}</p>
                            <Badge className="bg-red-600 mt-2">DVD Stanica</Badge>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    
                    {/* Active Users */}
                    {activeUsers.map((activeUser, index) => (
                      <Marker
                        key={index}
                        position={[activeUser.latitude, activeUser.longitude]}
                        icon={firefighterIcon}
                      >
                        <Popup>
                          <div className="p-2">
                            <p><strong>Vatrogasac ID:</strong> {activeUser.user_id}</p>
                            <p><strong>Status:</strong> 
                              <Badge className={activeUser.status === 'active' ? 'bg-green-500' : 'bg-red-500'}>
                                {activeUser.status === 'active' ? 'Aktivan' : 'Neaktivan'}
                              </Badge>
                            </p>
                            <p><strong>Vrijeme:</strong> {new Date(activeUser.timestamp).toLocaleTimeString()}</p>
                            <Button 
                              size="sm" 
                              onClick={() => pingUser(activeUser.user_id)}
                              className="mt-2"
                            >
                              Ping
                            </Button>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                    {/* Hydrants */}
                    {hydrants.map((hydrant) => (
                      <Marker
                        key={hydrant.id}
                        position={[hydrant.latitude, hydrant.longitude]}
                        icon={hydrant.tip_hidranta === 'nadzemni' ? nadzemniHydrantIcon : podzemniHydrantIcon}
                      >
                        <Popup>
                          <div className="p-2">
                            {hydrant.address && <p><strong>Adresa:</strong> {hydrant.address}</p>}
                            <p><strong>Tip:</strong> 
                              <Badge className={hydrant.tip_hidranta === 'podzemni' ? 'bg-red-500' : 'bg-blue-500'}>
                                {hydrant.tip_hidranta === 'podzemni' ? '🔴 Podzemni' : '🔵 Nadzemni'}
                              </Badge>
                            </p>
                            <p><strong>Status:</strong> 
                              <Badge className={hydrant.status === 'working' ? 'bg-green-500' : 'bg-red-500'}>
                                {hydrant.status === 'working' ? 'Ispravan' : 'Neispravan'}
                              </Badge>
                            </p>
                            {hydrant.notes && <p><strong>Napomene:</strong> {hydrant.notes}</p>}
                            {hydrant.last_check && (
                              <p><strong>Zadnja provjera:</strong> {new Date(hydrant.last_check).toLocaleDateString()}</p>
                            )}
                            {hydrant.images && hydrant.images.length > 0 && (
                              <div className="mt-2">
                                <p><strong>Slike:</strong></p>
                                {hydrant.images.map((image, idx) => (
                                  <img key={idx} src={image} alt="Hidrant" className="w-16 h-16 object-cover rounded mt-1" />
                                ))}
                              </div>
                            )}
                            {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                              <div className="flex space-x-2 mt-2">
                                <HydrantUpdateDialog hydrant={hydrant} onUpdate={updateHydrant} />
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => deleteHydrant(hydrant.id)}
                                >
                                  Obriši
                                </Button>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Aktivni Članovi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeUsers.length === 0 ? (
                    <p className="text-gray-500">Nema aktivnih članova</p>
                  ) : (
                    activeUsers.map((activeUser, index) => (
                      <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <p className="font-semibold">Član ID: {activeUser.user_id}</p>
                          <p className="text-sm text-gray-600">
                            Zadnje ažuriranje: {new Date(activeUser.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={activeUser.status === 'active' ? 'bg-green-500' : 'bg-red-500'}>
                            {activeUser.status === 'active' ? 'Aktivan' : 'Neaktivan'}
                          </Badge>
                          <Button size="sm" onClick={() => pingUser(activeUser.user_id)}>
                            Ping
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hydrants">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Hidrantska Mreža</CardTitle>
                  {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                    <AddHydrantDialog onAdd={addHydrant} />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {hydrants.map((hydrant) => (
                    <div key={hydrant.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          {hydrant.address && <p><strong>Adresa:</strong> {hydrant.address}</p>}
                          <p><strong>Pozicija:</strong> {hydrant.latitude.toFixed(6)}, {hydrant.longitude.toFixed(6)}</p>
                          <p><strong>Tip:</strong> 
                            <Badge className={hydrant.tip_hidranta === 'podzemni' ? 'bg-red-500 ml-2' : 'bg-blue-500 ml-2'}>
                              {hydrant.tip_hidranta === 'podzemni' ? '🔴 Podzemni' : '🔵 Nadzemni'}
                            </Badge>
                          </p>
                          <p><strong>Status:</strong> 
                            <Badge className={hydrant.status === 'working' ? 'bg-green-500 ml-2' : 'bg-red-500 ml-2'}>
                              {hydrant.status === 'working' ? 'Ispravan' : 'Neispravan'}
                            </Badge>
                          </p>
                          {hydrant.notes && <p><strong>Napomene:</strong> {hydrant.notes}</p>}
                          {hydrant.last_check && (
                            <p><strong>Zadnja provjera:</strong> {new Date(hydrant.last_check).toLocaleDateString()}</p>
                          )}
                          {hydrant.images && hydrant.images.length > 0 && (
                            <div className="mt-2">
                              <p><strong>Slike:</strong></p>
                              <div className="flex space-x-2 mt-1">
                                {hydrant.images.map((image, idx) => (
                                  <img key={idx} src={image} alt="Hidrant" className="w-20 h-20 object-cover rounded" />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                          <div className="flex space-x-2">
                            <HydrantUpdateDialog hydrant={hydrant} onUpdate={updateHydrant} />
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => deleteHydrant(hydrant.id)}
                            >
                              Obriši
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Vozila</CardTitle>
                  <Button onClick={fetchVehicles}>
                    Osvježi popis vozila
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {vehicles.length === 0 ? (
                    <p className="text-gray-500">Nema vozila za prikaz</p>
                  ) : (
                    vehicles.map((vehicle) => (
                      <div key={vehicle.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-lg">{vehicle.name}</h3>
                            <p><strong>Tip:</strong> {vehicle.type}</p>
                            <p><strong>Registracija:</strong> {vehicle.license_plate}</p>
                            <p><strong>Društvo:</strong> {formatDepartmentName(vehicle.department)}</p>
                            {vehicle.year && <p><strong>Godina:</strong> {vehicle.year}</p>}
                            <p><strong>Status:</strong> 
                              <Badge className={vehicle.status === 'active' ? 'bg-green-500 ml-2' : 'bg-red-500 ml-2'}>
                                {vehicle.status}
                              </Badge>
                            </p>
                            {vehicle.technical_inspection_valid_until && (
                              <p><strong>Tehnički do:</strong> {new Date(vehicle.technical_inspection_valid_until).toLocaleDateString()}</p>
                            )}
                            {vehicle.next_service_due && (
                              <p><strong>Sljedeći servis:</strong> {new Date(vehicle.next_service_due).toLocaleDateString()}</p>
                            )}
                            {vehicle.notes && <p><strong>Napomene:</strong> {vehicle.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Oprema</CardTitle>
                  <Button onClick={fetchEquipment}>
                    Osvježi popis opreme
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {equipment.length === 0 ? (
                    <p className="text-gray-500">Nema opreme za prikaz</p>
                  ) : (
                    equipment.map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-lg">{item.name}</h3>
                            <p><strong>Tip:</strong> {item.type}</p>
                            {item.serial_number && <p><strong>Serijski broj:</strong> {item.serial_number}</p>}
                            <p><strong>Društvo:</strong> {formatDepartmentName(item.department)}</p>
                            <p><strong>Lokacija:</strong> {item.location}</p>
                            <p><strong>Stanje:</strong> 
                              <Badge className={item.condition === 'good' ? 'bg-green-500 ml-2' : 'bg-orange-500 ml-2'}>
                                {item.condition}
                              </Badge>
                            </p>
                            {item.next_inspection_due && (
                              <p><strong>Sljedeća provjera:</strong> {new Date(item.next_inspection_due).toLocaleDateString()}</p>
                            )}
                            {item.assigned_to_user && <p><strong>Dodijeljeno korisniku:</strong> {item.assigned_to_user}</p>}
                            {item.notes && <p><strong>Napomene:</strong> {item.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {(user?.is_vzo_member && hasManagementPermission(user?.role, user?.is_vzo_member)) && (
            <TabsContent value="admin">
              <Card>
                <CardHeader>
                  <CardTitle>Administracija Korisnika</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button onClick={fetchAllUsers} className="mb-4">
                      Osvježi popis korisnika
                    </Button>
                    
                    {allUsers.length === 0 ? (
                      <p className="text-gray-500">Nema korisnika za prikaz</p>
                    ) : (
                      <div className="grid gap-4">
                        {allUsers.map((adminUser) => (
                          <div key={adminUser.id} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <p><strong>Ime:</strong> {adminUser.full_name}</p>
                                <p><strong>Korisničko ime:</strong> {adminUser.username}</p>
                                <p><strong>Email:</strong> {adminUser.email}</p>
                                <p><strong>Društvo:</strong> {formatDepartmentName(adminUser.department)}</p>
                                <p><strong>Uloga:</strong> {formatRoleName(adminUser.role)}</p>
                                <p><strong>VZO član:</strong> 
                                  <Badge className={adminUser.is_vzo_member ? 'bg-yellow-500 ml-2' : 'bg-gray-500 ml-2'}>
                                    {adminUser.is_vzo_member ? 'Da' : 'Ne'}
                                  </Badge>
                                </p>
                                <p><strong>Status:</strong> 
                                  <Badge className={adminUser.is_active ? 'bg-green-500 ml-2' : 'bg-red-500 ml-2'}>
                                    {adminUser.is_active ? 'Aktivan' : 'Neaktivan'}
                                  </Badge>
                                </p>
                                <p><strong>Registriran:</strong> {new Date(adminUser.created_at).toLocaleDateString()}</p>
                              </div>
                              <UserUpdateDialog user={adminUser} onUpdate={updateUser} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

// Hydrant Update Dialog
const HydrantUpdateDialog = ({ hydrant, onUpdate }) => {
  const [status, setStatus] = useState(hydrant.status);
  const [tipHidranta, setTipHidranta] = useState(hydrant.tip_hidranta || 'nadzemni');
  const [address, setAddress] = useState(hydrant.address || '');
  const [notes, setNotes] = useState(hydrant.notes || '');
  const [images, setImages] = useState(hydrant.images || []);
  const [open, setOpen] = useState(false);

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDataUrl = e.target.result;
        setImages(prev => [...prev, imageDataUrl]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdate = () => {
    onUpdate(hydrant.id, status, tipHidranta, address, notes, images);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Ažuriraj</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-50">
        <DialogHeader>
          <DialogTitle>Ažuriranje Hidranta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Tip hidranta</label>
            <Select value={tipHidranta} onValueChange={setTipHidranta}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nadzemni">🔵 Nadzemni</SelectItem>
                <SelectItem value="podzemni">🔴 Podzemni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Adresa</label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ulica i broj, Gornji Kneginec"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="working">Ispravan</SelectItem>
                <SelectItem value="broken">Neispravan</SelectItem>
                <SelectItem value="maintenance">Održavanje</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dodatne napomene..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Slike</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="mb-2"
            />
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img src={image} alt="Hidrant" className="w-full h-16 object-cover rounded" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute -top-1 -right-1 w-4 h-4 p-0"
                      onClick={() => removeImage(index)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleUpdate} className="w-full">
            Spremi Promjene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add Hydrant Dialog
const AddHydrantDialog = ({ onAdd }) => {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [status, setStatus] = useState('working');
  const [tipHidranta, setTipHidranta] = useState('nadzemni');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);
  const [open, setOpen] = useState(false);

  const useMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude.toFixed(6));
          setLng(position.coords.longitude.toFixed(6));
        },
        (error) => {
          alert('Greška pri dohvaćanju GPS pozicije: ' + error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    } else {
      alert('GPS nije podržan u vašem pregledniku');
    }
  };

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDataUrl = e.target.result;
        setImages(prev => [...prev, imageDataUrl]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (lat && lng) {
      onAdd(parseFloat(lat), parseFloat(lng), status, tipHidranta, address, notes, images);
      setLat('');
      setLng('');
      setAddress('');
      setNotes('');
      setImages([]);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dodaj Hidrant</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-50">
        <DialogHeader>
          <DialogTitle>Dodaj Novi Hidrant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Koordinate</label>
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={useMyLocation}
              >
                📍 Koristi moju lokaciju
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Geografska širina</label>
                <Input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="46.250800"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Geografska dužina</label>
                <Input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="16.375500"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Adresa</label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ulica i broj, Gornji Kneginec"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Tip hidranta</label>
            <Select value={tipHidranta} onValueChange={setTipHidranta}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nadzemni">🔵 Nadzemni</SelectItem>
                <SelectItem value="podzemni">🔴 Podzemni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="working">Ispravan</SelectItem>
                <SelectItem value="broken">Neispravan</SelectItem>
                <SelectItem value="maintenance">Održavanje</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dodatne informacije..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Slike</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="mb-2"
            />
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img src={image} alt="Hidrant" className="w-full h-16 object-cover rounded" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute -top-1 -right-1 w-4 h-4 p-0"
                      onClick={() => removeImage(index)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleAdd} className="w-full">
            Dodaj Hidrant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// User Update Dialog
const UserUpdateDialog = ({ user: adminUser, onUpdate }) => {
  const [role, setRole] = useState(adminUser.role);
  const [department, setDepartment] = useState(adminUser.department);
  const [isActive, setIsActive] = useState(adminUser.is_active);
  const [isVzoMember, setIsVzoMember] = useState(adminUser.is_vzo_member);
  const [open, setOpen] = useState(false);

  const handleUpdate = () => {
    const updates = {
      role,
      department,
      is_active: isActive,
      is_vzo_member: isVzoMember
    };
    onUpdate(adminUser.id, updates);
    setOpen(false);
  };

  const getAvailableRoles = () => {
    if (isVzoMember) {
      return [
        { value: 'predsjednik_vzo', label: 'Predsjednik VZO-a' },
        { value: 'zamjenik_predsjednika_vzo', label: 'Zamjenik predsjednika VZO-a' },
        { value: 'tajnik_vzo', label: 'Tajnik VZO-a' },
        { value: 'zapovjednik_vzo', label: 'Zapovjednik VZO-a' },
        { value: 'zamjenik_zapovjednika_vzo', label: 'Zamjenik zapovjednika VZO-a' }
      ];
    } else {
      return [
        { value: 'clan_bez_funkcije', label: 'Član bez funkcije' },
        { value: 'predsjednik', label: 'Predsjednik' },
        { value: 'tajnik', label: 'Tajnik' },
        { value: 'zapovjednik', label: 'Zapovjednik' },
        { value: 'zamjenik_zapovjednika', label: 'Zamjenik zapovjednika' },
        { value: 'spremistar', label: 'Spremistar' },
        { value: 'blagajnik', label: 'Blagajnik' },
        { value: 'upravni_odbor', label: 'Upravni odbor' },
        { value: 'nadzorni_odbor', label: 'Nadzorni odbor' },
        { value: 'zapovjednistvo', label: 'Zapovjedništvo' }
      ];
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Uredi</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-50">
        <DialogHeader>
          <DialogTitle>Uređivanje korisnika: {adminUser.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="vzo_member_edit"
              checked={isVzoMember}
              onCheckedChange={(checked) => {
                setIsVzoMember(checked);
                setDepartment(checked ? 'VZO' : '');
                setRole('');
              }}
            />
            <label htmlFor="vzo_member_edit" className="text-sm font-medium">
              VZO član
            </label>
          </div>

          {!isVzoMember && (
            <div>
              <label className="text-sm font-medium">Društvo</label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                  <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                  <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                  <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Uloga</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getAvailableRoles().map((roleOption) => (
                  <SelectItem key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active_edit"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <label htmlFor="is_active_edit" className="text-sm font-medium">
              Korisnik je aktivan
            </label>
          </div>

          <div className="flex space-x-2">
            <Button onClick={handleUpdate} className="flex-1">
              Spremi promjene
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Odustani
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main App Component
const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

// Route Guards
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? children : <Navigate to="/" />;
};

export default App;