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
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
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
          <CardTitle className="text-center text-2xl font-bold text-red-700">
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

    // Fetch hydrants
    fetchHydrants();

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
    const tip = prompt('Tip hidranta (podzemni/nadzemni):', 'nadzemni');
    const status = prompt('Status (working/broken/maintenance):', 'working');
    const notes = prompt('Napomene (opcionalno):');
    
    if (tip && status) {
      await addHydrant(lat, lng, status, tip, notes || '');
    }
  };

  const addHydrant = async (lat, lng, status, tip_hidranta, notes, images = []) => {
    try {
      await axios.post(`${API}/hydrants`, {
        latitude: lat,
        longitude: lng,
        status,
        tip_hidranta,
        notes,
        images
      });
      fetchHydrants();
    } catch (error) {
      console.error('Error adding hydrant:', error);
    }
  };

  const updateHydrant = async (hydrantId, status, tip_hidranta, notes, images) => {
    try {
      await axios.put(`${API}/hydrants/${hydrantId}`, {
        status,
        tip_hidranta,
        notes,
        images
      });
      fetchHydrants();
    } catch (error) {
      console.error('Error updating hydrant:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-red-600 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Vatrogasna Zajednica Gornji Kneginec</h1>
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="map">Karta</TabsTrigger>
            <TabsTrigger value="members">Članovi</TabsTrigger>
            <TabsTrigger value="hydrants">Hidranti</TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Live Mapa</CardTitle>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm">GPS Praćenje:</label>
                    <Switch
                      checked={gpsEnabled}
                      onCheckedChange={setGpsEnabled}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-96 rounded-lg overflow-hidden border">
                  <MapContainer
                    center={[45.1, 15.2]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {/* Map click handler for adding hydrants */}
                    <MapClickHandler onMapClick={handleMapClick} />
                    
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
                              <HydrantUpdateDialog hydrant={hydrant} onUpdate={updateHydrant} />
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
                          <HydrantUpdateDialog hydrant={hydrant} onUpdate={updateHydrant} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Hydrant Update Dialog
const HydrantUpdateDialog = ({ hydrant, onUpdate }) => {
  const [status, setStatus] = useState(hydrant.status);
  const [tipHidranta, setTipHidranta] = useState(hydrant.tip_hidranta || 'nadzemni');
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
    onUpdate(hydrant.id, status, tipHidranta, notes, images);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Ažuriraj</Button>
      </DialogTrigger>
      <DialogContent>
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
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);
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

  const handleAdd = () => {
    if (lat && lng) {
      onAdd(parseFloat(lat), parseFloat(lng), status, tipHidranta, notes, images);
      setLat('');
      setLng('');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj Novi Hidrant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Geografska širina</label>
            <Input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="46.161100"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Geografska dužina</label>
            <Input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="15.123456"
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