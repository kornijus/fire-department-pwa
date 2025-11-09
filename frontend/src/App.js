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
// Zelena točka za online korisnike
const activeUserIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#22c55e" stroke="#16a34a" stroke-width="2"/>
      <circle cx="12" cy="12" r="6" fill="#4ade80"/>
    </svg>
  `),
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10]
});

// Plava točka za nadzemne hidrante (bez H)
const nadzemniHydrantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
    </svg>
  `),
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8]
});

// Crvena točka za podzemne hidrante (bez H)
const podzemniHydrantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#dc2626" stroke="#991b1b" stroke-width="2"/>
    </svg>
  `),
  iconSize: [16, 16], 
  iconAnchor: [8, 8],
  popupAnchor: [0, -8]
});

// NEW: DVD Station icon - Much more visible
const dvdStationIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="6" y="18" width="36" height="24" rx="3" fill="#dc2626" stroke="#000" stroke-width="2"/><rect x="10" y="22" width="5" height="4" fill="white" stroke="#333" stroke-width="1"/><rect x="17" y="22" width="5" height="4" fill="white" stroke="#333" stroke-width="1"/><rect x="26" y="22" width="5" height="4" fill="white" stroke="#333" stroke-width="1"/><rect x="33" y="22" width="5" height="4" fill="white" stroke="#333" stroke-width="1"/><rect x="20" y="30" width="8" height="12" fill="#8B0000" stroke="#000" stroke-width="1"/><polygon points="24,6 6,18 42,18" fill="#8B0000" stroke="#000" stroke-width="2"/><rect x="32" y="8" width="4" height="10" fill="#666" stroke="#000" stroke-width="1"/><rect x="12" y="35" width="24" height="6" fill="white" stroke="#000" stroke-width="1"/><text x="24" y="39" text-anchor="middle" fill="#dc2626" font-size="8" font-weight="bold">DVD</text></svg>'),
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -48]
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
    is_vzo_member: false,  // NEW: VZO membership flag
    is_operational: false  // NEW: Operational member flag
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
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="operational_member"
                    checked={formData.is_operational}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, is_operational: checked });
                    }}
                  />
                  <label htmlFor="operational_member" className="text-sm font-medium">
                    Operativni član 🚒
                  </label>
                </div>
                <p className="text-xs text-gray-600 -mt-2">
                  *Operativni članovi sudjeluju u intervencijama i imaju pristup operativnom chatu
                </p>
                
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
  const [gpsEnabled, setGpsEnabled] = useState(true); // Default: GPS uključen
  const [userLocation, setUserLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isAddingHydrant, setIsAddingHydrant] = useState(false);
  const [isAddingDvdStation, setIsAddingDvdStation] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [dvdStations, setDvdStations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [events, setEvents] = useState([]); // Novi: događaji (osiguranja, školovanja, provjere)
  const [messages, setMessages] = useState([]); // Novi: grupne poruke
  const [interventions, setInterventions] = useState([]); // Novi: intervencije/izvještaji
  const [chatMessages, setChatMessages] = useState([]); // Novi: chat poruke
  const [selectedChatUser, setSelectedChatUser] = useState(null); // Za privatni chat
  const [selectedChatType, setSelectedChatType] = useState('group_all'); // 'private', 'group_operational', ili 'group_all'
  const [unreadCount, setUnreadCount] = useState(0);
  const watchId = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    console.log('🔌 Spajam se na WebSocket:', BACKEND_URL);
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      path: '/socket.io/',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    console.log('🔌 Socket options:', {
      transports: ['websocket', 'polling'],
      path: '/socket.io/'
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ WebSocket spojen! Socket ID:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket odspojen!');
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connect error:', error);
    });

    newSocket.on('error', (error) => {
      console.error('❌ Socket.IO error:', error);
    });

    newSocket.on('connection_success', (data) => {
      console.log('✅ Backend potvrda:', data.message);
      
      // Test: Pošalji test event
      console.log('🧪 Šaljem test event...');
      newSocket.emit('test_event', { test: 'hello from frontend' });
    });

    newSocket.on('location_received', (data) => {
      console.log('✅ BACKEND POTVRDIO PRIMANJE:', data.message, 'Ukupno korisnika:', data.user_count);
    });

    newSocket.on('user_locations', (locations) => {
      console.log('📥 Primljene lokacije korisnika:', locations.length, 'korisnika', locations);
      setActiveUsers(locations);
    });

    newSocket.on('ping_received', (data) => {
      alert(`Ping od ${data.from_user_id}: ${data.message}`);
    });

    newSocket.on('new_message', (message) => {
      // Refresh messages when new message is received
      fetchMessages();
      // Show notification
      alert(`Nova poruka: ${message.title}\n${message.content}`);
    });

    newSocket.on('new_chat_message', (message) => {
      console.log('📨 Nova chat poruka:', message);
      // Refresh unread count
      fetchUnreadCount();
      // If viewing current chat, refresh it
      if (selectedChatType === 'private' && selectedChatUser && 
          (message.sender_id === selectedChatUser.id || message.recipient_id === selectedChatUser.id)) {
        fetchPrivateChat(selectedChatUser.id);
      } else if (selectedChatType === 'group_operational' && message.group_id === `${user?.department}_operational`) {
        fetchGroupChat('operational');
      } else if (selectedChatType === 'group_all' && message.group_id === `${user?.department}_all`) {
        fetchGroupChat('all');
      }
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
    console.log('📍 GPS useEffect:', { gpsEnabled, user: !!user });
    if (gpsEnabled && user) {
      console.log('✅ GPS je uključen, pokrećem praćenje (HTTP polling)...');
      startLocationTracking();
    } else {
      console.log('⏹️ GPS isključen ili nema usera, zaustavljam praćenje...');
      stopLocationTracking();
    }
  }, [gpsEnabled, user]);

  // Debug: Log when activeUsers changes
  useEffect(() => {
    console.log('🔄 activeUsers state changed:', activeUsers.length, activeUsers);
  }, [activeUsers]);

  // Fetch active user locations via HTTP polling
  const fetchActiveLocations = async () => {
    try {
      const response = await axios.get(`${API}/locations/active`);
      console.log('📥 HTTP polling - primljeno korisnika:', response.data.length);
      setActiveUsers(response.data);
    } catch (error) {
      console.error('Error fetching active locations:', error);
    }
  };

  // Fetch data when user logs in
  useEffect(() => {
    if (user) {
      fetchDvdStations();
      fetchVehicles();
      fetchEquipment();
      fetchAllUsers(); // Fetch users for equipment assignment
      fetchEvents(); // Fetch events
      fetchMessages(); // Fetch messages
      fetchInterventions(); // Fetch interventions
      fetchUnreadCount(); // Fetch unread chat count
      
      // Start polling for active locations every 3 seconds
      const locationInterval = setInterval(fetchActiveLocations, 3000);
      
      // Poll for unread messages every 10 seconds
      const chatInterval = setInterval(fetchUnreadCount, 10000);
      
      // Cleanup on unmount
      return () => {
        clearInterval(locationInterval);
        clearInterval(chatInterval);
      };
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
    console.log('🚀 Pokretanje GPS praćenja...');
    
    if (!navigator.geolocation) {
      console.error('❌ GPS nije podržan');
      alert('GPS nije podržan u vašem pregledniku');
      return;
    }

    // Ne trebamo više socket jer koristimo HTTP polling!
    console.log('✅ Koristim HTTP umjesto WebSocket-a');

    // Prvo provjerimo dozvolu
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        console.log('📍 GPS dozvola status:', result.state);
        if (result.state === 'denied') {
          alert('⚠️ GPS pristup je blokiran!\n\nNa mobitelu:\n1. Idite u Postavke → Safari/Chrome\n2. Postavke → Lokacija\n3. Omogućite "Dok koristim aplikaciju"\n\nNa računalu:\n4. Kliknite 🔒 pored URL-a\n5. Postavke stranice → Lokacija → Dopusti');
        } else if (result.state === 'prompt') {
          console.log('📍 Tražim dozvolu od korisnika...');
        }
      }).catch(err => {
        console.warn('⚠️ Permissions API nije dostupan:', err);
      });
    }

    // Prvo pokušaj dobiti trenutnu poziciju kao test
    console.log('🔍 Testiram GPS...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ GPS TEST USPJEŠAN:', position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn('⚠️ GPS test neuspješan:', error.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 0
      }
    );

    // Odmah pošalji testnu lokaciju kao fallback
    if (user) {
      console.log('🧪 Šaljem inicijalnu testnu lokaciju...');
      const initialTestLocation = {
        latitude: 46.3061,
        longitude: 16.3378
      };
      
      axios.post(`${API}/locations/update`, initialTestLocation)
        .then(response => {
          console.log('✅ Inicijalna testna lokacija poslana! Aktivnih:', response.data.user_count);
        })
        .catch(error => {
          console.error('❌ Greška pri slanju inicijalne lokacije:', error);
        });
    }
    
    // Pokreni praćenje sa većim timeout-om i bez high accuracy
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        
        console.log('📍 ✅ Nova GPS pozicija dobivena:', location);
        console.log('📍 Točnost:', position.coords.accuracy, 'metara');
        setUserLocation(location);
        
        if (!user) {
          console.error('❌ User nije dostupan! Ne mogu poslati lokaciju.');
          return;
        }
        
        console.log('📤 Šaljem lokaciju na server za korisnika:', user.full_name, user.id);
        console.log('📤 POST URL:', `${API}/locations/update`);
        console.log('📤 Data:', location);
        
        // Use HTTP POST instead of WebSocket
        axios.post(`${API}/locations/update`, location)
          .then(response => {
            console.log('✅ Lokacija poslana! Response:', response.data);
            console.log('✅ Aktivnih korisnika:', response.data.user_count);
          })
          .catch(error => {
            console.error('❌ Greška pri slanju lokacije!');
            console.error('❌ Error response:', error.response?.data);
            console.error('❌ Error status:', error.response?.status);
            console.error('❌ Full error:', error);
          });
      },
      (error) => {
        console.error('❌ GPS greška (kod ' + error.code + '):', error.message);
        
        // Pokušaj s testnom lokacijom ako je timeout ili bilo koja greška
        console.log('⚠️ GPS greška - koristim testnu lokaciju (Varaždin)...');
        const testLocation = {
          latitude: 46.3061,
          longitude: 16.3378
        };
        
        console.log('🧪 Koristim testnu lokaciju:', testLocation);
        setUserLocation(testLocation);
        
        if (user) {
          console.log('📤 Šaljem TESTNU lokaciju na server...');
          axios.post(`${API}/locations/update`, testLocation)
            .then(response => {
              console.log('✅ TESTNA lokacija poslana! Response:', response.data);
            })
            .catch(error => {
              console.error('❌ Greška pri slanju TESTNE lokacije:', error);
            });
        }
        
        if (error.code === 3) {
          alert('⚠️ GPS timeout - koristi se testna lokacija (Varaždin centar).');
        } else if (error.code === 1) {
          let errorMsg = 'Greška pri dohvaćanju GPS pozicije: ';
          if (error.code === 1) {
            errorMsg = '⚠️ Dozvola za GPS je odbijena! Molimo omogućite pristup lokaciji.';
          } else if (error.code === 2) {
            errorMsg = '⚠️ GPS pozicija nije dostupna.';
          }
          alert(errorMsg);
        }
      },
      {
        enableHighAccuracy: false, // Promijenjeno na false za brže dohvaćanje
        timeout: 30000, // Povećano na 30 sekundi
        maximumAge: 10000 // Prihvati stariju poziciju
      }
    );
    
    console.log('✅ GPS praćenje pokrenuto, watchId:', watchId.current);
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
    // Ako je VZO član, automatski ima pristup
    if (isVzoMember) {
      return true;
    }
    
    // DVD članovi s management rolama
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
    
    if (isAddingDvdStation && hasManagementPermission(user?.role, user?.is_vzo_member)) {
      const confirmed = window.confirm(
        `Postaviti DVD stanicu na poziciju:\nŠirina: ${latlng.lat.toFixed(6)}\nDužina: ${latlng.lng.toFixed(6)}?`
      );
      
      if (confirmed) {
        setClickedPosition(latlng);
        setIsAddingDvdStation(false); // Close adding mode
        // Open add station dialog will automatically use clickedPosition
      }
    }
    
    setClickedPosition(latlng);
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
      const response = await axios.post(`${API}/hydrants`, {
        latitude: lat,
        longitude: lng,
        status,
        tip_hidranta,
        address,
        notes,
        images
      });
      console.log('Hidrant dodan:', response.data);
      await fetchHydrants(); // Čekamo da se učita
      alert('✅ Hidrant uspješno dodan!');
    } catch (error) {
      console.error('Error adding hydrant:', error);
      alert('❌ Greška pri dodavanju hidranta: ' + (error.response?.data?.detail || error.message));
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

  const addDvdStation = async (name, address, lat, lng, phone, email, year) => {
    try {
      await axios.post(`${API}/dvd-stations`, {
        name,
        address,
        latitude: lat,
        longitude: lng,
        contact_phone: phone || null,
        contact_email: email || null,
        established_year: year || null
      });
      fetchDvdStations();
    } catch (error) {
      console.error('Error adding DVD station:', error);
    }
  };

  const updateDvdStation = async (stationId, updates) => {
    try {
      await axios.put(`${API}/dvd-stations/${stationId}`, updates);
      fetchDvdStations();
    } catch (error) {
      console.error('Error updating DVD station:', error);
    }
  };

  const deleteDvdStation = async (stationId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovu DVD stanicu?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/dvd-stations/${stationId}`);
        fetchDvdStations();
      } catch (error) {
        console.error('Error deleting DVD station:', error);
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

  // Fetch events (školovanja, osiguranja, provjere)
  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`);
      setEvents(response.data);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  // Fetch interventions
  const fetchInterventions = async () => {
    try {
      const response = await axios.get(`${API}/interventions`);
      setInterventions(response.data);
    } catch (error) {
      console.error('Error fetching interventions:', error);
    }
  };

  // Vehicle CRUD operations
  const addVehicle = async (vehicleData) => {
    try {
      await axios.post(`${API}/vehicles`, vehicleData);
      fetchVehicles();
    } catch (error) {
      console.error('Error adding vehicle:', error);
      alert('Greška pri dodavanju vozila');
    }
  };

  const updateVehicle = async (vehicleId, updates) => {
    try {
      await axios.put(`${API}/vehicles/${vehicleId}`, updates);
      fetchVehicles();
    } catch (error) {
      console.error('Error updating vehicle:', error);
      alert('Greška pri ažuriranju vozila');
    }
  };

  const deleteVehicle = async (vehicleId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovo vozilo?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/vehicles/${vehicleId}`);
        fetchVehicles();
      } catch (error) {
        console.error('Error deleting vehicle:', error);
        alert('Greška pri brisanju vozila');
      }
    }
  };

  // Equipment CRUD operations
  const addEquipment = async (equipmentData) => {
    try {
      await axios.post(`${API}/equipment`, equipmentData);
      fetchEquipment();
      fetchAllUsers(); // Refresh to show equipment assignments
    } catch (error) {
      console.error('Error adding equipment:', error);
      alert('Greška pri dodavanju opreme');
    }
  };

  // Event CRUD operations
  const addEvent = async (eventData) => {
    try {
      await axios.post(`${API}/events`, eventData);
      fetchEvents();
    } catch (error) {
      console.error('Error adding event:', error);
      alert('Greška pri dodavanju događaja');
    }
  };

  const updateEvent = async (eventId, updates) => {
    try {
      await axios.put(`${API}/events/${eventId}`, updates);
      fetchEvents();
    } catch (error) {
      console.error('Error updating event:', error);
      alert('Greška pri ažuriranju događaja');
    }
  };

  const deleteEvent = async (eventId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovaj događaj?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/events/${eventId}`);
        fetchEvents();
      } catch (error) {
        console.error('Error deleting event:', error);
        alert('Greška pri brisanju događaja');
      }
    }
  };

  // Message operations
  const sendMessage = async (messageData) => {
    try {
      await axios.post(`${API}/messages`, messageData);
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Greška pri slanju poruke');
    }
  };

  // Chat operations
  const sendChatMessage = async (messageData) => {
    try {
      await axios.post(`${API}/chat/send`, messageData);
      // Refresh current chat
      if (selectedChatType === 'private' && selectedChatUser) {
        fetchPrivateChat(selectedChatUser.id);
      } else if (selectedChatType === 'group') {
        fetchGroupChat(user.department);
      }
    } catch (error) {
      console.error('Error sending chat message:', error);
      alert('Greška pri slanju poruke');
    }
  };

  const fetchPrivateChat = async (userId) => {
    try {
      const response = await axios.get(`${API}/chat/private/${userId}`);
      setChatMessages(response.data);
    } catch (error) {
      console.error('Error fetching private chat:', error);
    }
  };

  const fetchGroupChat = async (groupType) => {
    try {
      // groupType može biti 'operational' ili 'general'
      const response = await axios.get(`${API}/chat/group/${groupType}`);
      setChatMessages(response.data);
    } catch (error) {
      console.error('Error fetching group chat:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get(`${API}/chat/unread-count`);
      setUnreadCount(response.data.unread_private);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  // Intervention operations
  const addIntervention = async (interventionData) => {
    try {
      await axios.post(`${API}/interventions`, interventionData);
      fetchInterventions();
      alert('✅ Izvještaj o intervenciji uspješno spremljen!');
    } catch (error) {
      console.error('Error adding intervention:', error);
      alert('Greška pri dodavanju izvještaja');
    }
  };

  const updateIntervention = async (interventionId, updates) => {
    try {
      await axios.put(`${API}/interventions/${interventionId}`, updates);
      fetchInterventions();
    } catch (error) {
      console.error('Error updating intervention:', error);
      alert('Greška pri ažuriranju izvještaja');
    }
  };

  const deleteIntervention = async (interventionId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovaj izvještaj?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/interventions/${interventionId}`);
        fetchInterventions();
      } catch (error) {
        console.error('Error deleting intervention:', error);
        alert('Greška pri brisanju izvještaja');
      }
    }
  };

  const updateEquipment = async (equipmentId, updates) => {
    try {
      await axios.put(`${API}/equipment/${equipmentId}`, updates);
      fetchEquipment();
      fetchAllUsers(); // Refresh to show equipment assignments
    } catch (error) {
      console.error('Error updating equipment:', error);
      alert('Greška pri ažuriranju opreme');
    }
  };

  const deleteEquipment = async (equipmentId) => {
    const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovu opremu?');
    if (confirmed) {
      try {
        await axios.delete(`${API}/equipment/${equipmentId}`);
        fetchEquipment();
        fetchAllUsers(); // Refresh to show equipment assignments
      } catch (error) {
        console.error('Error deleting equipment:', error);
        alert('Greška pri brisanju opreme');
      }
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
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-11">
            <TabsTrigger value="dashboard">Pregled</TabsTrigger>
            <TabsTrigger value="map">Karta</TabsTrigger>
            <TabsTrigger value="members">Članovi</TabsTrigger>
            <TabsTrigger value="hydrants">Hidranti</TabsTrigger>
            <TabsTrigger value="vehicles">Vozila</TabsTrigger>
            <TabsTrigger value="equipment">Oprema</TabsTrigger>
            <TabsTrigger value="interventions">🚒 Intervencije</TabsTrigger>
            <TabsTrigger value="events">Događaji</TabsTrigger>
            <TabsTrigger value="communication">Komunikacija</TabsTrigger>
            {hasManagementPermission(user?.role, user?.is_vzo_member) && (
              <TabsTrigger value="stations">DVD Stanice</TabsTrigger>
            )}
            {(user?.is_vzo_member && hasManagementPermission(user?.role, user?.is_vzo_member)) && (
              <TabsTrigger value="admin">Administracija</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Brzi pregled</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Ukupno članova:</span>
                      <Badge>{allUsers.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Aktivnih hidranta:</span>
                      <Badge className="bg-green-500">
                        {hydrants.filter(h => h.status === 'working').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Vozila:</span>
                      <Badge className="bg-blue-500">{vehicles.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Oprema:</span>
                      <Badge className="bg-purple-500">{equipment.length}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Due Medical Exams */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-orange-600">⚠️ Liječnički pregledi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {allUsers
                      .filter(member => {
                        if (!member.medical_exam_valid_until) return false;
                        const validUntil = new Date(member.medical_exam_valid_until);
                        const now = new Date();
                        const monthFromNow = new Date();
                        monthFromNow.setMonth(monthFromNow.getMonth() + 1);
                        return validUntil <= monthFromNow;
                      })
                      .slice(0, 5)
                      .map(member => (
                        <div key={member.id} className="flex justify-between items-center text-sm">
                          <span className="truncate">{member.full_name}</span>
                          <Badge className={
                            new Date(member.medical_exam_valid_until) < new Date() 
                              ? 'bg-red-500' 
                              : 'bg-orange-500'
                          }>
                            {new Date(member.medical_exam_valid_until).toLocaleDateString()}
                          </Badge>
                        </div>
                      ))}
                    {allUsers.filter(m => m.medical_exam_valid_until).length === 0 && (
                      <p className="text-gray-500 text-sm">Nema podataka o liječničkim pregledima</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Vehicle Maintenance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-blue-600">🚗 Vozila - servis/tehnički</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {vehicles
                      .filter(vehicle => {
                        if (!vehicle.next_service_due && !vehicle.technical_inspection_valid_until) return false;
                        const now = new Date();
                        const monthFromNow = new Date();
                        monthFromNow.setMonth(monthFromNow.getMonth() + 1);
                        
                        const serviceDue = vehicle.next_service_due ? new Date(vehicle.next_service_due) <= monthFromNow : false;
                        const techDue = vehicle.technical_inspection_valid_until ? new Date(vehicle.technical_inspection_valid_until) <= monthFromNow : false;
                        
                        return serviceDue || techDue;
                      })
                      .slice(0, 5)
                      .map(vehicle => (
                        <div key={vehicle.id} className="space-y-1 text-sm">
                          <div className="font-medium">{vehicle.name}</div>
                          {vehicle.next_service_due && new Date(vehicle.next_service_due) <= new Date(Date.now() + 30*24*60*60*1000) && (
                            <div className="flex justify-between">
                              <span>Servis:</span>
                              <Badge className="bg-orange-500">
                                {new Date(vehicle.next_service_due).toLocaleDateString()}
                              </Badge>
                            </div>
                          )}
                          {vehicle.technical_inspection_valid_until && new Date(vehicle.technical_inspection_valid_until) <= new Date(Date.now() + 30*24*60*60*1000) && (
                            <div className="flex justify-between">
                              <span>Tehnički:</span>
                              <Badge className="bg-red-500">
                                {new Date(vehicle.technical_inspection_valid_until).toLocaleDateString()}
                              </Badge>
                            </div>
                          )}
                        </div>
                      ))}
                    {vehicles.length === 0 && (
                      <p className="text-gray-500 text-sm">Nema podataka o vozilima</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Broken Hydrants */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-red-600">🚨 Neispravni hidranti</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {hydrants
                      .filter(hydrant => hydrant.status !== 'working')
                      .slice(0, 5)
                      .map(hydrant => (
                        <div key={hydrant.id} className="flex justify-between items-center text-sm">
                          <div>
                            <div className="font-medium">
                              {hydrant.address || `${hydrant.latitude.toFixed(4)}, ${hydrant.longitude.toFixed(4)}`}
                            </div>
                            <div className="text-xs text-gray-500">
                              {hydrant.tip_hidranta === 'podzemni' ? '🔴 Podzemni' : '🔵 Nadzemni'}
                            </div>
                          </div>
                          <Badge className="bg-red-500">
                            {hydrant.status}
                          </Badge>
                        </div>
                      ))}
                    {hydrants.filter(h => h.status !== 'working').length === 0 && (
                      <p className="text-green-600 text-sm">✅ Svi hidranti su ispravni</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Equipment Due for Inspection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-purple-600">🛡️ Oprema - provjere</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {equipment
                      .filter(item => {
                        if (!item.next_inspection_due) return false;
                        const inspectionDue = new Date(item.next_inspection_due);
                        const now = new Date();
                        const monthFromNow = new Date();
                        monthFromNow.setMonth(monthFromNow.getMonth() + 1);
                        return inspectionDue <= monthFromNow;
                      })
                      .slice(0, 5)
                      .map(item => (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-gray-500">{item.type}</div>
                          </div>
                          <Badge className={
                            new Date(item.next_inspection_due) < new Date() 
                              ? 'bg-red-500' 
                              : 'bg-orange-500'
                          }>
                            {new Date(item.next_inspection_due).toLocaleDateString()}
                          </Badge>
                        </div>
                      ))}
                    {equipment.filter(e => e.next_inspection_due).length === 0 && (
                      <p className="text-gray-500 text-sm">Nema podataka o provjeri opreme</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-green-600">📊 Nedavne aktivnosti</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Zadnji dodani hidrant:</span>
                      <span className="text-gray-600">
                        {hydrants.length > 0 
                          ? new Date(Math.max(...hydrants.map(h => new Date(h.created_at)))).toLocaleDateString()
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Aktivnih GPS članova:</span>
                      <Badge className="bg-green-500">{activeUsers.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Ukupno članova registriranih:</span>
                      <span className="text-gray-600">{allUsers.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Live Mapa Hidrantske Mreže</CardTitle>
                  <div className="flex items-center space-x-4">
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <>
                        <Button
                          onClick={() => {
                            setIsAddingHydrant(!isAddingHydrant);
                            if (!isAddingHydrant) setIsAddingDvdStation(false); // Close DVD mode
                          }}
                          className={isAddingHydrant ? 'bg-green-600' : 'bg-blue-600'}
                        >
                          {isAddingHydrant ? 'Odustani' : 'Dodaj Hidrant'}
                        </Button>
                        <Button
                          onClick={() => {
                            setIsAddingDvdStation(!isAddingDvdStation);
                            if (!isAddingDvdStation) setIsAddingHydrant(false); // Close Hydrant mode
                          }}
                          className={isAddingDvdStation ? 'bg-green-600' : 'bg-red-600'}
                        >
                          {isAddingDvdStation ? 'Odustani' : '🏠 Dodaj DVD Stanicu'}
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
                    <AlertDescription>🔵 Kliknite na kartu za dodavanje novog hidranta</AlertDescription>
                  </Alert>
                )}
                {isAddingDvdStation && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertDescription>🏠 Kliknite na kartu za postavljanje DVD stanice</AlertDescription>
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
                    
                    {/* DVD Stations - Vidljive i draggable */}
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
                    {console.log('🗺️ Rendering active users on map:', activeUsers.length, activeUsers)}
                    {activeUsers.map((activeUser, index) => (
                      <Marker
                        key={index}
                        position={[activeUser.latitude, activeUser.longitude]}
                        icon={activeUserIcon}
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
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active">Aktivni Članovi</TabsTrigger>
                <TabsTrigger value="all">Svi Članovi</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active">
                <Card>
                  <CardHeader>
                    <CardTitle>Aktivni Članovi (GPS Tracking)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {activeUsers.length === 0 ? (
                        <p className="text-gray-500">Nema aktivnih članova s GPS-om</p>
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

              <TabsContent value="all">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Svi Članovi Zajednice</CardTitle>
                      <div className="flex space-x-2">
                        {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                          <Button 
                            onClick={() => {
                              const dept = user.is_vzo_member ? 'VZO' : user.department;
                              window.open(`${API}/pdf/evidencijski-list/${dept}`, '_blank');
                            }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            📄 Evidencijski List PDF
                          </Button>
                        )}
                        <Button onClick={fetchAllUsers}>
                          Osvježi popis
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {allUsers.length === 0 ? (
                        <p className="text-gray-500">Nema članova za prikaz</p>
                      ) : (
                        <div className="grid gap-4">
                          {allUsers.map((member) => (
                            <div key={member.id} className="p-4 border rounded-lg">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h3 className="font-bold text-lg">{member.full_name}</h3>
                                  <p className="text-sm text-gray-600 mb-2">{member.email}</p>
                                  
                                  <div className="grid grid-cols-2 gap-4 mb-3">
                                    <div>
                                      <p><strong>Društvo:</strong> {formatDepartmentName(member.department)}</p>
                                      <p><strong>Funkcija:</strong> {formatRoleName(member.role)}</p>
                                      {member.phone && <p><strong>Telefon:</strong> {member.phone}</p>}
                                      {member.address && <p><strong>Adresa:</strong> {member.address}</p>}
                                    </div>
                                    <div>
                                      {member.medical_exam_valid_until && (
                                        <p><strong>Liječnički do:</strong> 
                                          <Badge className={new Date(member.medical_exam_valid_until) > new Date() ? 'bg-green-500 ml-2' : 'bg-red-500 ml-2'}>
                                            {new Date(member.medical_exam_valid_until).toLocaleDateString()}
                                          </Badge>
                                        </p>
                                      )}
                                      {member.assigned_equipment && member.assigned_equipment.length > 0 && (
                                        <p><strong>Zadužena oprema:</strong> {member.assigned_equipment.join(', ')}</p>
                                      )}
                                      {member.certifications && member.certifications.length > 0 && (
                                        <p><strong>Certifikat:</strong> {member.certifications.join(', ')}</p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="flex space-x-2">
                                    <Badge className={member.is_active ? 'bg-green-500' : 'bg-red-500'}>
                                      {member.is_active ? 'Aktivan' : 'Neaktivan'}
                                    </Badge>
                                    {member.is_vzo_member && (
                                      <Badge className="bg-yellow-500 text-black">VZO</Badge>
                                    )}
                                    {member.is_operational && (
                                      <Badge className="bg-red-600">🚒 Operativac</Badge>
                                    )}
                                  </div>
                                </div>
                                
                                {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                                  <div className="flex flex-col space-y-2">
                                    <MemberDetailDialog member={member} onUpdate={updateUser} />
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => window.open(`${API}/pdf/osobno-zaduzenje/${member.id}`, '_blank')}
                                      className="bg-blue-50"
                                    >
                                      📄 PDF Zaduženja
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => pingUser(member.id)}>
                                      Ping
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
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
                  <div className="flex space-x-2">
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <Button 
                        onClick={() => {
                          const dept = user.is_vzo_member ? 'VZO' : user.department;
                          window.open(`${API}/pdf/oprema-vozilo/${dept}`, '_blank');
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        📄 Lista Opreme Vozilo PDF
                      </Button>
                    )}
                    <Button onClick={fetchVehicles} variant="outline">
                      Osvježi popis
                    </Button>
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <AddVehicleDialog onAdd={addVehicle} userDepartment={user?.department} />
                    )}
                  </div>
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
                          <div className="flex-1">
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
                          {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                            <div className="flex space-x-2">
                              <VehicleUpdateDialog vehicle={vehicle} onUpdate={updateVehicle} />
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => deleteVehicle(vehicle.id)}
                              >
                                Obriši
                              </Button>
                            </div>
                          )}
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
                  <div className="flex space-x-2">
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <Button 
                        onClick={() => {
                          const dept = user.is_vzo_member ? 'VZO' : user.department;
                          window.open(`${API}/pdf/oprema-spremiste/${dept}`, '_blank');
                        }}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        📄 Lista Opreme Spremište PDF
                      </Button>
                    )}
                    <Button onClick={fetchEquipment} variant="outline">
                      Osvježi popis
                    </Button>
                    {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                      <AddEquipmentDialog 
                        onAdd={addEquipment} 
                        userDepartment={user?.department}
                        allUsers={allUsers}
                        vehicles={vehicles}
                      />
                    )}
                  </div>
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
                          <div className="flex-1">
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
                            {item.assigned_to_user && (
                              <p><strong>Dodijeljeno članu:</strong> {allUsers.find(u => u.id === item.assigned_to_user)?.full_name || item.assigned_to_user}</p>
                            )}
                            {item.assigned_to_vehicle && (
                              <p><strong>Dodijeljeno vozilu:</strong> {vehicles.find(v => v.id === item.assigned_to_vehicle)?.name || item.assigned_to_vehicle}</p>
                            )}
                            {item.notes && <p><strong>Napomene:</strong> {item.notes}</p>}
                          </div>
                          {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                            <div className="flex space-x-2">
                              <EquipmentUpdateDialog 
                                equipment={item} 
                                onUpdate={updateEquipment}
                                allUsers={allUsers}
                                vehicles={vehicles}
                              />
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => deleteEquipment(item.id)}
                              >
                                Obriši
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Događaji (Školovanja, Osiguranja, Provjere)</CardTitle>
                  {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                    <AddEventDialog onAdd={addEvent} userDepartment={user?.department} allUsers={allUsers} />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {events.length === 0 ? (
                    <p className="text-gray-500">Nema događaja za prikaz</p>
                  ) : (
                    events.map((event) => (
                      <div key={event.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg">{event.title}</h3>
                            <p><strong>Tip:</strong> {event.event_type}</p>
                            <p><strong>Datum:</strong> {new Date(event.date).toLocaleDateString()}</p>
                            <p><strong>Društvo:</strong> {formatDepartmentName(event.department)}</p>
                            {event.location && <p><strong>Lokacija:</strong> {event.location}</p>}
                            {event.description && <p><strong>Opis:</strong> {event.description}</p>}
                            {event.participants && event.participants.length > 0 && (
                              <div className="mt-2">
                                <p><strong>Sudionici ({event.participants.length}):</strong></p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {event.participants.map(userId => {
                                    const participant = allUsers.find(u => u.id === userId);
                                    return participant ? (
                                      <Badge key={userId} variant="outline">{participant.full_name}</Badge>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                            <div className="flex space-x-2">
                              <EventUpdateDialog event={event} onUpdate={updateEvent} allUsers={allUsers} />
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => deleteEvent(event.id)}
                              >
                                Obriši
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communication">
            <div className="grid grid-cols-3 gap-4">
              {/* Chat UI - Sidebar with chat types */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    💬 Chat
                    {unreadCount > 0 && (
                      <Badge className="bg-red-600">{unreadCount}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Grupni chatovi */}
                  <div className="space-y-2 pb-2 border-b">
                    <p className="text-xs font-semibold text-gray-600 uppercase">Grupni Chat</p>
                    
                    {/* Operativni članovi chat - samo za operativce */}
                    {user?.is_operational && (
                      <Button
                        onClick={() => {
                          setSelectedChatType('group_operational');
                          setSelectedChatUser(null);
                          fetchGroupChat('operational');
                        }}
                        className={`w-full justify-start ${selectedChatType === 'group_operational' ? 'bg-red-600' : 'bg-red-500'}`}
                        size="sm"
                      >
                        🚒 Operativni Članovi
                      </Button>
                    )}
                    
                    {/* Svi članovi chat - za sve */}
                    <Button
                      onClick={() => {
                        setSelectedChatType('group_all');
                        setSelectedChatUser(null);
                        fetchGroupChat('all');
                      }}
                      className={`w-full justify-start ${selectedChatType === 'group_all' ? 'bg-blue-600' : 'bg-blue-500'}`}
                      size="sm"
                    >
                      👥 Svi Članovi
                    </Button>
                  </div>
                  
                  {/* Privatni chat - samo operativci */}
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Privatne poruke (Operativci)</p>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {allUsers
                        .filter(u => u.id !== user.id && u.is_operational === true)
                        .map(chatUser => (
                          <Button
                            key={chatUser.id}
                            onClick={() => {
                              setSelectedChatType('private');
                              setSelectedChatUser(chatUser);
                              fetchPrivateChat(chatUser.id);
                            }}
                            variant="outline"
                            size="sm"
                            className={`w-full justify-start ${
                              selectedChatUser?.id === chatUser.id ? 'bg-blue-100' : ''
                            }`}
                          >
                            👤 {chatUser.full_name}
                          </Button>
                        ))}
                      {allUsers.filter(u => u.id !== user.id && u.is_operational === true).length === 0 && (
                        <p className="text-xs text-gray-500 italic">Nema operativnih članova</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Chat Messages Area */}
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle>
                    {selectedChatType === 'group_operational' 
                      ? `🚒 Operativni Članovi - Chat`
                      : selectedChatType === 'group_all'
                        ? `👥 Svi Članovi - Chat`
                        : selectedChatUser 
                          ? `👤 ${selectedChatUser.full_name}`
                          : '💬 Odaberite razgovor'
                    }
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    {selectedChatType === 'group_operational' 
                      ? 'Operativni chat za uzbune, intervencije i školovanja'
                      : selectedChatType === 'group_all'
                        ? 'Općeniti chat za sve članove društva'
                        : selectedChatUser 
                          ? 'Privatna komunikacija'
                          : 'Odaberite grupni ili privatni chat'
                    }
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col" style={{height: '500px'}}>
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 bg-gray-50 rounded">
                    {chatMessages.length === 0 ? (
                      <p className="text-gray-500 text-center mt-10">Nema poruka</p>
                    ) : (
                      chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs p-3 rounded-lg ${
                              msg.sender_id === user.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border'
                            }`}
                          >
                            {msg.sender_id !== user.id && (
                              <p className="text-xs font-semibold mb-1">{msg.sender_name}</p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-1 ${msg.sender_id === user.id ? 'text-blue-200' : 'text-gray-500'}`}>
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Input */}
                  {(selectedChatType === 'group_operational' || selectedChatType === 'group_all' || selectedChatUser) && (
                    <ChatInput
                      onSend={(content) => {
                        const messageData = {
                          chat_type: selectedChatType === 'private' ? 'private' : 'group',
                          content: content,
                          recipient_id: selectedChatType === 'private' ? selectedChatUser.id : null,
                          group_id: selectedChatType === 'group_operational' ? `${user.department}_operational` : 
                                   selectedChatType === 'group_all' ? `${user.department}_all` : null
                        };
                        sendChatMessage(messageData);
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Obavijesti - stari Messages */}
            <Card className="mt-4">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>📢 Obavijesti i Uzbune</CardTitle>
                  {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                    <SendMessageDialog onSend={sendMessage} />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-gray-500">Nema obavijesti</p>
                  ) : (
                    messages.slice().reverse().map((message) => (
                      <div key={message.id} className={`p-4 border rounded-lg ${
                        message.priority === 'urgent' ? 'border-red-500 bg-red-50' : 
                        message.priority === 'normal' ? 'border-blue-500 bg-blue-50' : 
                        'border-gray-300'
                      }`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-bold text-lg">{message.title}</h3>
                            <p className="text-sm text-gray-600">
                              Od: {message.sent_by_name} • {new Date(message.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Badge className={
                              message.priority === 'urgent' ? 'bg-red-600' :
                              message.priority === 'normal' ? 'bg-blue-600' :
                              'bg-gray-600'
                            }>
                              {message.priority === 'urgent' ? '🚨 HITNO' : 
                               message.priority === 'normal' ? 'Normalno' : 
                               'Nisko'}
                            </Badge>
                            <Badge variant="outline">{message.message_type}</Badge>
                          </div>
                        </div>
                        <p className="text-gray-800 whitespace-pre-wrap">{message.content}</p>
                        <div className="mt-2 text-sm text-gray-600">
                          <strong>Poslano na:</strong> {message.sent_to_departments.includes('all') ? 'Svi' : message.sent_to_departments.map(formatDepartmentName).join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interventions">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>🚒 Izvještaji o Intervencijama</CardTitle>
                  <AddInterventionDialog 
                    onAdd={addIntervention} 
                    allUsers={allUsers}
                    vehicles={vehicles}
                    userDepartment={user?.department}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {interventions.length === 0 ? (
                    <p className="text-gray-500">Nema evidentiranih intervencija</p>
                  ) : (
                    interventions.slice().reverse().map((intervention) => (
                      <div key={intervention.id} className="p-4 border rounded-lg bg-gradient-to-r from-red-50 to-orange-50">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-red-600 text-white">
                                {intervention.intervention_type.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">
                                {intervention.status === 'completed' ? '✅ Završeno' : '🔄 U tijeku'}
                              </Badge>
                            </div>
                            <h3 className="font-bold text-xl">{intervention.location}</h3>
                            <p className="text-sm text-gray-600">
                              📅 {new Date(intervention.date).toLocaleString()} • 
                              📍 {intervention.address}
                            </p>
                            {intervention.departments && intervention.departments.length > 0 && (
                              <p className="text-sm text-gray-700 mt-1">
                                🚒 DVD-ovi: {intervention.departments.map(formatDepartmentName).join(', ')}
                              </p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">
                              Evidentirao: {intervention.created_by_name}
                            </p>
                          </div>
                          {hasManagementPermission(user?.role, user?.is_vzo_member) && (
                            <div className="flex space-x-2">
                              <InterventionUpdateDialog 
                                intervention={intervention} 
                                onUpdate={updateIntervention}
                                allUsers={allUsers}
                                vehicles={vehicles}
                              />
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => deleteIntervention(intervention.id)}
                              >
                                Obriši
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded mb-2">
                          <h4 className="font-semibold mb-1">Opis intervencije:</h4>
                          <p className="text-gray-800 whitespace-pre-wrap">{intervention.description}</p>
                        </div>

                        {intervention.actions_taken && (
                          <div className="bg-white p-3 rounded mb-2">
                            <h4 className="font-semibold mb-1">Poduzete mjere:</h4>
                            <p className="text-gray-800 whitespace-pre-wrap">{intervention.actions_taken}</p>
                          </div>
                        )}

                        {intervention.participants && intervention.participants.length > 0 && (
                          <div className="mb-2">
                            <p className="font-semibold mb-1">👥 Sudionici ({intervention.participants.length}):</p>
                            <div className="flex flex-wrap gap-1">
                              {intervention.participants.map(userId => {
                                const participant = allUsers.find(u => u.id === userId);
                                return participant ? (
                                  <Badge key={userId} variant="outline">{participant.full_name}</Badge>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}

                        {intervention.vehicles_used && intervention.vehicles_used.length > 0 && (
                          <div className="mb-2">
                            <p className="font-semibold mb-1">🚒 Korištena vozila ({intervention.vehicles_used.length}):</p>
                            <div className="flex flex-wrap gap-1">
                              {intervention.vehicles_used.map(vehicleId => {
                                const vehicle = vehicles.find(v => v.id === vehicleId);
                                return vehicle ? (
                                  <Badge key={vehicleId} variant="outline" className="bg-blue-100">
                                    {vehicle.name}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}

                        {intervention.images && intervention.images.length > 0 && (
                          <div className="mt-3">
                            <p className="font-semibold mb-2">📸 Fotografije ({intervention.images.length}):</p>
                            <div className="grid grid-cols-4 gap-2">
                              {intervention.images.map((img, idx) => (
                                <img 
                                  key={idx} 
                                  src={img} 
                                  alt={`Slika ${idx + 1}`}
                                  className="w-full h-24 object-cover rounded cursor-pointer hover:scale-105 transition"
                                  onClick={() => window.open(img, '_blank')}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {hasManagementPermission(user?.role, user?.is_vzo_member) && (
            <TabsContent value="stations">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>DVD Stanice</CardTitle>
                    <div className="flex space-x-2">
                      <Button onClick={fetchDvdStations}>
                        Osvježi stanice
                      </Button>
                      {(user?.is_vzo_member || user?.role === 'predsjednik') && (
                        <AddStationDialog onAdd={addDvdStation} clickedPosition={clickedPosition} />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {dvdStations.length === 0 ? (
                      <p className="text-gray-500">Nema DVD stanica za prikaz</p>
                    ) : (
                      dvdStations.map((station) => (
                        <div key={station.id} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-bold text-lg text-red-700">{station.name}</h3>
                              <p><strong>Adresa:</strong> {station.address}</p>
                              <p><strong>Koordinate:</strong> {station.latitude.toFixed(6)}, {station.longitude.toFixed(6)}</p>
                              {station.contact_phone && <p><strong>Telefon:</strong> {station.contact_phone}</p>}
                              {station.contact_email && <p><strong>Email:</strong> {station.contact_email}</p>}
                              {station.established_year && <p><strong>Osnovano:</strong> {station.established_year}</p>}
                              
                              <div className="mt-3 flex space-x-2">
                                <Badge className="bg-red-600">DVD Stanica</Badge>
                                <Badge variant="outline">
                                  Na karti: {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
                                </Badge>
                              </div>
                            </div>
                            
                            {(user?.is_vzo_member || station.name.includes(user?.department?.replace('DVD_', '').replace('_', ' '))) && (
                              <div className="flex flex-col space-y-2">
                                <StationUpdateDialog station={station} onUpdate={updateDvdStation} />
                                {user?.is_vzo_member && (
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => deleteDvdStation(station.id)}
                                  >
                                    Obriši
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {(user?.is_vzo_member && hasManagementPermission(user?.role, user?.is_vzo_member)) && (
            <TabsContent value="admin">
              <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="users">Korisnici</TabsTrigger>
                  <TabsTrigger value="logos">Grbovi DVD-ova</TabsTrigger>
                </TabsList>
                
                <TabsContent value="users">
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
                                    <p><strong>Operativni član:</strong> 
                                      <Badge className={adminUser.is_operational ? 'bg-red-600 ml-2' : 'bg-gray-500 ml-2'}>
                                        {adminUser.is_operational ? '🚒 Da' : 'Ne'}
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
                
                <TabsContent value="logos">
                  <Card>
                    <CardHeader>
                      <CardTitle>Upravljanje Grbovima DVD-ova</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <LogoManagementPanel />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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
    console.log('🔍 Pokušavam dohvatiti GPS lokaciju...');
    if (navigator.geolocation) {
      // Prikaz loading stanja
      setLat('Učitavanje...');
      setLng('Učitavanje...');
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(6);
          const lng = position.coords.longitude.toFixed(6);
          console.log('✅ GPS lokacija dobivena:', lat, lng);
          setLat(lat);
          setLng(lng);
          alert('✅ GPS lokacija dobivena!');
        },
        (error) => {
          console.error('❌ GPS greška:', error);
          setLat('');
          setLng('');
          let errorMsg = 'Greška pri dohvaćanju GPS pozicije: ';
          if (error.code === 1) {
            errorMsg += 'Dozvola odbijena. Molimo omogućite pristup lokaciji u postavkama preglednika.';
          } else if (error.code === 2) {
            errorMsg += 'Pozicija nije dostupna.';
          } else if (error.code === 3) {
            errorMsg += 'Istek vremena. Pokušajte ponovno.';
          } else {
            errorMsg += error.message;
          }
          alert(errorMsg);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    } else {
      console.error('❌ GPS nije podržan');
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
  const [isOperational, setIsOperational] = useState(adminUser.is_operational || false);
  const [open, setOpen] = useState(false);

  const handleUpdate = () => {
    const updates = {
      role,
      department,
      is_active: isActive,
      is_vzo_member: isVzoMember,
      is_operational: isOperational
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_operational_edit"
              checked={isOperational}
              onCheckedChange={setIsOperational}
            />
            <label htmlFor="is_operational_edit" className="text-sm font-medium">
              🚒 Operativni član
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

// Member Detail Dialog
const MemberDetailDialog = ({ member, onUpdate }) => {
  const [phone, setPhone] = useState(member.phone || '');
  const [address, setAddress] = useState(member.address || '');
  const [medicalExamDate, setMedicalExamDate] = useState(
    member.medical_exam_date ? new Date(member.medical_exam_date).toISOString().split('T')[0] : ''
  );
  const [medicalValidUntil, setMedicalValidUntil] = useState(
    member.medical_exam_valid_until ? new Date(member.medical_exam_valid_until).toISOString().split('T')[0] : ''
  );
  const [assignedEquipment, setAssignedEquipment] = useState(member.assigned_equipment?.join(', ') || '');
  const [certifications, setCertifications] = useState(member.certifications?.join(', ') || '');
  const [open, setOpen] = useState(false);

  const handleUpdate = () => {
    const updates = {
      phone: phone || null,
      address: address || null,
      medical_exam_date: medicalExamDate ? new Date(medicalExamDate).toISOString() : null,
      medical_exam_valid_until: medicalValidUntil ? new Date(medicalValidUntil).toISOString() : null,
      assigned_equipment: assignedEquipment ? assignedEquipment.split(',').map(item => item.trim()) : [],
      certifications: certifications ? certifications.split(',').map(item => item.trim()) : []
    };
    onUpdate(member.id, updates);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Detalji</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl z-50">
        <DialogHeader>
          <DialogTitle>Detalji člana: {member.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Telefon</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+385 42 123 456"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Adresa</label>
              <Input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ulica i broj, grad"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Datum liječničkog pregleda</label>
              <Input
                type="date"
                value={medicalExamDate}
                onChange={(e) => setMedicalExamDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Liječnički vrijedi do</label>
              <Input
                type="date"
                value={medicalValidUntil}
                onChange={(e) => setMedicalValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Zadužena oprema (odvojeno zarezom)</label>
            <Textarea
              value={assignedEquipment}
              onChange={(e) => setAssignedEquipment(e.target.value)}
              placeholder="Kaciga, Odijelo, Boce za zrak, Crijevo..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Certifikati (odvojeno zarezom)</label>
            <Textarea
              value={certifications}
              onChange={(e) => setCertifications(e.target.value)}
              placeholder="Osnovni vatrogasni tečaj, Prva pomoć, Vozač..."
              rows={3}
            />
          </div>

          <div className="flex space-x-2 pt-4">
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

// Add Station Dialog
const AddStationDialog = ({ onAdd, clickedPosition }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [year, setYear] = useState('');
  const [open, setOpen] = useState(false);

  // Auto-fill coordinates when clickedPosition changes
  useEffect(() => {
    if (clickedPosition) {
      setLat(clickedPosition.lat.toFixed(6));
      setLng(clickedPosition.lng.toFixed(6));
      setOpen(true); // Auto-open dialog
    }
  }, [clickedPosition]);

  const useMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude.toFixed(6));
          setLng(position.coords.longitude.toFixed(6));
        },
        (error) => {
          alert('Greška pri dohvaćanju GPS pozicije: ' + error.message);
        }
      );
    }
  };

  const handleAdd = () => {
    if (name && address && lat && lng) {
      onAdd(name, address, parseFloat(lat), parseFloat(lng), phone, email, year ? parseInt(year) : null);
      setName('');
      setAddress('');
      setLat('');
      setLng('');
      setPhone('');
      setEmail('');
      setYear('');
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dodaj DVD Stanicu</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl z-50">
        <DialogHeader>
          <DialogTitle>Dodaj novu DVD stanicu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv DVD-a</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="DVD Kneginec Gornji"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Godina osnivanja</label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1993"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Adresa</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ulica i broj, grad"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Koordinate na karti</label>
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={useMyLocation}
              >
                📍 Koristi moju lokaciju
              </Button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2 text-sm">
              💡 <strong>Savjet:</strong> Možete kliknuti na kartu (tab "Karta") da odaberete točnu lokaciju!
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
                  required
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
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Telefon</label>
              <Input
                type="tel"  
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+385 42 123 456"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dvd@example.hr"
              />
            </div>
          </div>

          <Button onClick={handleAdd} className="w-full">
            Dodaj DVD Stanicu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Station Update Dialog
const StationUpdateDialog = ({ station, onUpdate }) => {
  const [name, setName] = useState(station.name);
  const [address, setAddress] = useState(station.address);
  const [lat, setLat] = useState(station.latitude.toString());
  const [lng, setLng] = useState(station.longitude.toString());
  const [phone, setPhone] = useState(station.contact_phone || '');
  const [email, setEmail] = useState(station.contact_email || '');
  const [year, setYear] = useState(station.established_year?.toString() || '');
  const [open, setOpen] = useState(false);

  const handleUpdate = () => {
    const updates = {
      name,
      address,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      contact_phone: phone || null,
      contact_email: email || null,
      established_year: year ? parseInt(year) : null
    };
    onUpdate(station.id, updates);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Uredi stanicu</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl z-50">
        <DialogHeader>
          <DialogTitle>Uređivanje DVD stanice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv DVD-a</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Godina osnivanja</label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Adresa</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Geografska širina</label>
              <Input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Geografska dužina</label>
              <Input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Telefon</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleUpdate} className="w-full">
            Spremi promjene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add Vehicle Dialog
const AddVehicleDialog = ({ onAdd, userDepartment }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'vatrogasno_vozilo',
    license_plate: '',
    department: userDepartment || '',
    year: new Date().getFullYear(),
    technical_inspection_date: '',
    technical_inspection_valid_until: '',
    last_service_date: '',
    next_service_due: '',
    service_km: '',
    current_km: '',
    status: 'active',
    notes: ''
  });

  const handleAdd = async () => {
    if (!formData.name || !formData.license_plate) {
      alert('Molimo unesite naziv vozila i registraciju');
      return;
    }

    const vehicleData = {
      ...formData,
      year: formData.year ? parseInt(formData.year) : null,
      service_km: formData.service_km ? parseInt(formData.service_km) : null,
      current_km: formData.current_km ? parseInt(formData.current_km) : null,
      technical_inspection_date: formData.technical_inspection_date || null,
      technical_inspection_valid_until: formData.technical_inspection_valid_until || null,
      last_service_date: formData.last_service_date || null,
      next_service_due: formData.next_service_due || null,
    };

    await onAdd(vehicleData);
    setFormData({
      name: '',
      type: 'vatrogasno_vozilo',
      license_plate: '',
      department: userDepartment || '',
      year: new Date().getFullYear(),
      technical_inspection_date: '',
      technical_inspection_valid_until: '',
      last_service_date: '',
      next_service_due: '',
      service_km: '',
      current_km: '',
      status: 'active',
      notes: ''
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dodaj Vozilo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Dodaj Novo Vozilo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv vozila *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Npr. Cisterna VW-1"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tip vozila</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cisterna">Cisterna</SelectItem>
                  <SelectItem value="kombi">Kombi</SelectItem>
                  <SelectItem value="vatrogasno_vozilo">Vatrogasno vozilo</SelectItem>
                  <SelectItem value="terensko">Terensko vozilo</SelectItem>
                  <SelectItem value="ostalo">Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Registarska oznaka *</label>
              <Input
                type="text"
                value={formData.license_plate}
                onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                placeholder="VŽ-1234-AB"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Godina proizvodnje</label>
              <Input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                placeholder="2020"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Društvo</label>
            <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                <SelectItem value="VZO">VZO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Tehnički pregled</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Datum zadnjeg tehničkog</label>
                <Input
                  type="date"
                  value={formData.technical_inspection_date}
                  onChange={(e) => setFormData({ ...formData, technical_inspection_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Tehnički vrijedi do</label>
                <Input
                  type="date"
                  value={formData.technical_inspection_valid_until}
                  onChange={(e) => setFormData({ ...formData, technical_inspection_valid_until: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Servis vozila</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Datum zadnjeg servisa</label>
                <Input
                  type="date"
                  value={formData.last_service_date}
                  onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Sljedeći servis</label>
                <Input
                  type="date"
                  value={formData.next_service_due}
                  onChange={(e) => setFormData({ ...formData, next_service_due: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">KM kod servisa</label>
                <Input
                  type="number"
                  value={formData.service_km}
                  onChange={(e) => setFormData({ ...formData, service_km: e.target.value })}
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="text-sm">Trenutni KM</label>
                <Input
                  type="number"
                  value={formData.current_km}
                  onChange={(e) => setFormData({ ...formData, current_km: e.target.value })}
                  placeholder="55000"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Status vozila</label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktivno</SelectItem>
                <SelectItem value="maintenance">U servisu</SelectItem>
                <SelectItem value="out_of_service">Van funkcije</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Dodatne napomene o vozilu..."
              rows={3}
            />
          </div>

          <Button onClick={handleAdd} className="w-full">
            Dodaj Vozilo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Update Vehicle Dialog
const VehicleUpdateDialog = ({ vehicle, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: vehicle.name || '',
    type: vehicle.type || 'vatrogasno_vozilo',
    license_plate: vehicle.license_plate || '',
    department: vehicle.department || '',
    year: vehicle.year || '',
    technical_inspection_date: vehicle.technical_inspection_date ? vehicle.technical_inspection_date.split('T')[0] : '',
    technical_inspection_valid_until: vehicle.technical_inspection_valid_until ? vehicle.technical_inspection_valid_until.split('T')[0] : '',
    last_service_date: vehicle.last_service_date ? vehicle.last_service_date.split('T')[0] : '',
    next_service_due: vehicle.next_service_due ? vehicle.next_service_due.split('T')[0] : '',
    service_km: vehicle.service_km || '',
    current_km: vehicle.current_km || '',
    status: vehicle.status || 'active',
    notes: vehicle.notes || ''
  });

  const handleUpdate = async () => {
    const updateData = {
      ...formData,
      year: formData.year ? parseInt(formData.year) : null,
      service_km: formData.service_km ? parseInt(formData.service_km) : null,
      current_km: formData.current_km ? parseInt(formData.current_km) : null,
      technical_inspection_date: formData.technical_inspection_date || null,
      technical_inspection_valid_until: formData.technical_inspection_valid_until || null,
      last_service_date: formData.last_service_date || null,
      next_service_due: formData.next_service_due || null,
    };

    await onUpdate(vehicle.id, updateData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Uredi</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Uredi Vozilo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv vozila</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tip vozila</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cisterna">Cisterna</SelectItem>
                  <SelectItem value="kombi">Kombi</SelectItem>
                  <SelectItem value="vatrogasno_vozilo">Vatrogasno vozilo</SelectItem>
                  <SelectItem value="terensko">Terensko vozilo</SelectItem>
                  <SelectItem value="ostalo">Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Registarska oznaka</label>
              <Input
                type="text"
                value={formData.license_plate}
                onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Godina proizvodnje</label>
              <Input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Društvo</label>
            <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                <SelectItem value="VZO">VZO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Tehnički pregled</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Datum zadnjeg tehničkog</label>
                <Input
                  type="date"
                  value={formData.technical_inspection_date}
                  onChange={(e) => setFormData({ ...formData, technical_inspection_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Tehnički vrijedi do</label>
                <Input
                  type="date"
                  value={formData.technical_inspection_valid_until}
                  onChange={(e) => setFormData({ ...formData, technical_inspection_valid_until: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Servis vozila</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Datum zadnjeg servisa</label>
                <Input
                  type="date"
                  value={formData.last_service_date}
                  onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Sljedeći servis</label>
                <Input
                  type="date"
                  value={formData.next_service_due}
                  onChange={(e) => setFormData({ ...formData, next_service_due: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">KM kod servisa</label>
                <Input
                  type="number"
                  value={formData.service_km}
                  onChange={(e) => setFormData({ ...formData, service_km: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Trenutni KM</label>
                <Input
                  type="number"
                  value={formData.current_km}
                  onChange={(e) => setFormData({ ...formData, current_km: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Status vozila</label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktivno</SelectItem>
                <SelectItem value="maintenance">U servisu</SelectItem>
                <SelectItem value="out_of_service">Van funkcije</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <Button onClick={handleUpdate} className="w-full">
            Spremi promjene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add Equipment Dialog
const AddEquipmentDialog = ({ onAdd, userDepartment, allUsers, vehicles }) => {
  const [open, setOpen] = useState(false);
  const [assignmentType, setAssignmentType] = useState('location'); // location, user, vehicle
  const [formData, setFormData] = useState({
    name: '',
    type: 'helmet',
    serial_number: '',
    department: userDepartment || '',
    location: '',
    storage_location: '',
    vehicle_location: '',
    container_number: '',
    container_name: '',
    last_inspection_date: '',
    next_inspection_due: '',
    condition: 'good',
    assigned_to_user: '',
    assigned_to_vehicle: '',
    notes: ''
  });

  const handleAdd = async () => {
    if (!formData.name || !formData.type) {
      alert('Molimo unesite naziv i tip opreme');
      return;
    }

    const equipmentData = {
      ...formData,
      assigned_to_user: assignmentType === 'user' ? formData.assigned_to_user : null,
      assigned_to_vehicle: assignmentType === 'vehicle' ? formData.assigned_to_vehicle : null,
      location: assignmentType === 'location' ? formData.location : (assignmentType === 'user' ? 'Dodijeljeno članu' : 'Dodijeljeno vozilu'),
      storage_location: assignmentType === 'location' ? formData.storage_location : null,
      vehicle_location: assignmentType === 'vehicle' ? formData.vehicle_location : null,
      container_number: assignmentType === 'vehicle' ? formData.container_number : null,
      container_name: assignmentType === 'vehicle' ? formData.container_name : null,
      last_inspection_date: formData.last_inspection_date || null,
      next_inspection_due: formData.next_inspection_due || null,
    };

    await onAdd(equipmentData);
    setFormData({
      name: '',
      type: 'helmet',
      serial_number: '',
      department: userDepartment || '',
      location: '',
      storage_location: '',
      vehicle_location: '',
      container_number: '',
      container_name: '',
      last_inspection_date: '',
      next_inspection_due: '',
      condition: 'good',
      assigned_to_user: '',
      assigned_to_vehicle: '',
      notes: ''
    });
    setAssignmentType('location');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dodaj Opremu</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Dodaj Novu Opremu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv opreme *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Npr. Kaciga broj 5"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tip opreme</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helmet">Kaciga</SelectItem>
                  <SelectItem value="suit">Odijelo</SelectItem>
                  <SelectItem value="boots">Čizme</SelectItem>
                  <SelectItem value="gloves">Rukavice</SelectItem>
                  <SelectItem value="tank">Boca (za zrak)</SelectItem>
                  <SelectItem value="mask">Maska</SelectItem>
                  <SelectItem value="hose">Crijevo</SelectItem>
                  <SelectItem value="nozzle">Mlaznica</SelectItem>
                  <SelectItem value="axe">Sjekira</SelectItem>
                  <SelectItem value="ladder">Ljestve</SelectItem>
                  <SelectItem value="tool">Alat</SelectItem>
                  <SelectItem value="other">Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Serijski broj</label>
              <Input
                type="text"
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                placeholder="SN-12345"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Društvo</label>
              <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                  <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                  <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                  <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                  <SelectItem value="VZO">VZO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Lokacija/Zaduženje</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'location'}
                  onChange={() => setAssignmentType('location')}
                />
                <span className="text-sm">Lokacija</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'user'}
                  onChange={() => setAssignmentType('user')}
                />
                <span className="text-sm">Dodijeljeno članu</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'vehicle'}
                  onChange={() => setAssignmentType('vehicle')}
                />
                <span className="text-sm">Dodijeljeno vozilu</span>
              </label>
            </div>

            {assignmentType === 'location' && (
              <div className="space-y-3">
                <Input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Npr. Garaža, DVD Stanica..."
                />
                <div>
                  <label className="text-sm font-medium">Točna lokacija (spremište)</label>
                  <Select value={formData.storage_location} onValueChange={(value) => setFormData({ ...formData, storage_location: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Odaberi spremište" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spremiste_1">Spremište 1</SelectItem>
                      <SelectItem value="spremiste_2">Spremište 2</SelectItem>
                      <SelectItem value="spremiste_3">Spremište 3</SelectItem>
                      <SelectItem value="ormar_1">Ormar 1</SelectItem>
                      <SelectItem value="ormar_2">Ormar 2</SelectItem>
                      <SelectItem value="ostalo">Ostalo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {assignmentType === 'user' && (
              <Select value={formData.assigned_to_user} onValueChange={(value) => setFormData({ ...formData, assigned_to_user: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi člana" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} ({user.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {assignmentType === 'vehicle' && (
              <div className="space-y-3">
                <Select value={formData.assigned_to_vehicle} onValueChange={(value) => setFormData({ ...formData, assigned_to_vehicle: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Odaberi vozilo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(vehicle => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} ({vehicle.license_plate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div>
                  <label className="text-sm font-medium">Lokacija na vozilu</label>
                  <Select value={formData.vehicle_location} onValueChange={(value) => setFormData({ ...formData, vehicle_location: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Gdje na vozilu?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="momcadska_kabina">Momčadska kabina</SelectItem>
                      <SelectItem value="teretni_dio">Teretni dio</SelectItem>
                      <SelectItem value="na_krovu">Na krovu vozila</SelectItem>
                      <SelectItem value="prednji_spremnik">Prednji spremnik</SelectItem>
                      <SelectItem value="straznji_spremnik">Stražnji spremnik</SelectItem>
                      <SelectItem value="bocni_spremnik">Bočni spremnik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Broj spremnika</label>
                    <Input
                      type="text"
                      value={formData.container_number}
                      onChange={(e) => setFormData({ ...formData, container_number: e.target.value })}
                      placeholder="Npr. S1, S2, B1..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Naziv spremnika</label>
                    <Input
                      type="text"
                      value={formData.container_name}
                      onChange={(e) => setFormData({ ...formData, container_name: e.target.value })}
                      placeholder="Npr. Glavni alat..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Provjera opreme</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Zadnja provjera</label>
                <Input
                  type="date"
                  value={formData.last_inspection_date}
                  onChange={(e) => setFormData({ ...formData, last_inspection_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Sljedeća provjera</label>
                <Input
                  type="date"
                  value={formData.next_inspection_due}
                  onChange={(e) => setFormData({ ...formData, next_inspection_due: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Stanje opreme</label>
            <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Dobro</SelectItem>
                <SelectItem value="needs_maintenance">Potrebno održavanje</SelectItem>
                <SelectItem value="damaged">Oštećeno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Dodatne napomene o opremi..."
              rows={3}
            />
          </div>

          <Button onClick={handleAdd} className="w-full">
            Dodaj Opremu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Update Equipment Dialog
const EquipmentUpdateDialog = ({ equipment, onUpdate, allUsers, vehicles }) => {
  const [open, setOpen] = useState(false);
  const [assignmentType, setAssignmentType] = useState(
    equipment.assigned_to_user ? 'user' : equipment.assigned_to_vehicle ? 'vehicle' : 'location'
  );
  const [formData, setFormData] = useState({
    name: equipment.name || '',
    type: equipment.type || 'helmet',
    serial_number: equipment.serial_number || '',
    department: equipment.department || '',
    location: equipment.location || '',
    storage_location: equipment.storage_location || '',
    vehicle_location: equipment.vehicle_location || '',
    container_number: equipment.container_number || '',
    container_name: equipment.container_name || '',
    last_inspection_date: equipment.last_inspection_date ? equipment.last_inspection_date.split('T')[0] : '',
    next_inspection_due: equipment.next_inspection_due ? equipment.next_inspection_due.split('T')[0] : '',
    condition: equipment.condition || 'good',
    assigned_to_user: equipment.assigned_to_user || '',
    assigned_to_vehicle: equipment.assigned_to_vehicle || '',
    notes: equipment.notes || ''
  });

  const handleUpdate = async () => {
    const updateData = {
      ...formData,
      assigned_to_user: assignmentType === 'user' ? formData.assigned_to_user : null,
      assigned_to_vehicle: assignmentType === 'vehicle' ? formData.assigned_to_vehicle : null,
      location: assignmentType === 'location' ? formData.location : (assignmentType === 'user' ? 'Dodijeljeno članu' : 'Dodijeljeno vozilu'),
      storage_location: assignmentType === 'location' ? formData.storage_location : null,
      vehicle_location: assignmentType === 'vehicle' ? formData.vehicle_location : null,
      container_number: assignmentType === 'vehicle' ? formData.container_number : null,
      container_name: assignmentType === 'vehicle' ? formData.container_name : null,
      last_inspection_date: formData.last_inspection_date || null,
      next_inspection_due: formData.next_inspection_due || null,
    };

    await onUpdate(equipment.id, updateData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Uredi</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Uredi Opremu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Naziv opreme</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tip opreme</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helmet">Kaciga</SelectItem>
                  <SelectItem value="suit">Odijelo</SelectItem>
                  <SelectItem value="boots">Čizme</SelectItem>
                  <SelectItem value="gloves">Rukavice</SelectItem>
                  <SelectItem value="tank">Boca (za zrak)</SelectItem>
                  <SelectItem value="mask">Maska</SelectItem>
                  <SelectItem value="hose">Crijevo</SelectItem>
                  <SelectItem value="nozzle">Mlaznica</SelectItem>
                  <SelectItem value="axe">Sjekira</SelectItem>
                  <SelectItem value="ladder">Ljestve</SelectItem>
                  <SelectItem value="tool">Alat</SelectItem>
                  <SelectItem value="other">Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Serijski broj</label>
              <Input
                type="text"
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Društvo</label>
              <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                  <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                  <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                  <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                  <SelectItem value="VZO">VZO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Lokacija/Zaduženje</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'location'}
                  onChange={() => setAssignmentType('location')}
                />
                <span className="text-sm">Lokacija</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'user'}
                  onChange={() => setAssignmentType('user')}
                />
                <span className="text-sm">Dodijeljeno članu</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={assignmentType === 'vehicle'}
                  onChange={() => setAssignmentType('vehicle')}
                />
                <span className="text-sm">Dodijeljeno vozilu</span>
              </label>
            </div>

            {assignmentType === 'location' && (
              <Input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            )}

            {assignmentType === 'user' && (
              <Select value={formData.assigned_to_user} onValueChange={(value) => setFormData({ ...formData, assigned_to_user: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi člana" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} ({user.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {assignmentType === 'vehicle' && (
              <Select value={formData.assigned_to_vehicle} onValueChange={(value) => setFormData({ ...formData, assigned_to_vehicle: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi vozilo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} ({vehicle.license_plate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Provjera opreme</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Zadnja provjera</label>
                <Input
                  type="date"
                  value={formData.last_inspection_date}
                  onChange={(e) => setFormData({ ...formData, last_inspection_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Sljedeća provjera</label>
                <Input
                  type="date"
                  value={formData.next_inspection_due}
                  onChange={(e) => setFormData({ ...formData, next_inspection_due: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Stanje opreme</label>
            <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Dobro</SelectItem>
                <SelectItem value="needs_maintenance">Potrebno održavanje</SelectItem>
                <SelectItem value="damaged">Oštećeno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Napomene</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <Button onClick={handleUpdate} className="w-full">
            Spremi promjene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add Event Dialog
const AddEventDialog = ({ onAdd, userDepartment, allUsers }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    event_type: 'training',
    date: '',
    department: userDepartment || '',
    participants: [],
    description: '',
    location: ''
  });

  const handleAdd = async () => {
    if (!formData.title || !formData.date) {
      alert('Molimo unesite naziv i datum događaja');
      return;
    }

    await onAdd(formData);
    setFormData({
      title: '',
      event_type: 'training',
      date: '',
      department: userDepartment || '',
      participants: [],
      description: '',
      location: ''
    });
    setOpen(false);
  };

  const toggleParticipant = (userId) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(userId)
        ? prev.participants.filter(id => id !== userId)
        : [...prev.participants, userId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dodaj Događaj</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Dodaj Novi Događaj</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Naziv događaja *</label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Npr. Godišnje školovanje 2025"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Tip događaja</label>
              <Select value={formData.event_type} onValueChange={(value) => setFormData({ ...formData, event_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Školovanje</SelectItem>
                  <SelectItem value="insurance">Osiguranje</SelectItem>
                  <SelectItem value="medical_check">Liječnički pregled</SelectItem>
                  <SelectItem value="equipment_check">Provjera opreme</SelectItem>
                  <SelectItem value="drill">Vježba</SelectItem>
                  <SelectItem value="meeting">Sastanak</SelectItem>
                  <SelectItem value="event">Događaj</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Datum *</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Društvo</label>
              <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VZO">VZO</SelectItem>
                  <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                  <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                  <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                  <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Lokacija</label>
              <Input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Npr. Vatrogasni dom"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Opis</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Opis događaja..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Sudionici (odaberi članove)</label>
            <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
              {allUsers.filter(u => u.department === formData.department || formData.department === 'VZO').map(user => (
                <div key={user.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.participants.includes(user.id)}
                    onCheckedChange={() => toggleParticipant(user.id)}
                  />
                  <span className="text-sm">{user.full_name} - {user.role}</span>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleAdd} className="w-full">
            Dodaj Događaj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Update Event Dialog
const EventUpdateDialog = ({ event, onUpdate, allUsers }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: event.title || '',
    event_type: event.event_type || 'training',
    date: event.date ? event.date.split('T')[0] : '',
    department: event.department || '',
    participants: event.participants || [],
    description: event.description || '',
    location: event.location || ''
  });

  const handleUpdate = async () => {
    await onUpdate(event.id, formData);
    setOpen(false);
  };

  const toggleParticipant = (userId) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(userId)
        ? prev.participants.filter(id => id !== userId)
        : [...prev.participants, userId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Uredi</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Uredi Događaj</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Naziv događaja</label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Tip događaja</label>
              <Select value={formData.event_type} onValueChange={(value) => setFormData({ ...formData, event_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Školovanje</SelectItem>
                  <SelectItem value="insurance">Osiguranje</SelectItem>
                  <SelectItem value="medical_check">Liječnički pregled</SelectItem>
                  <SelectItem value="equipment_check">Provjera opreme</SelectItem>
                  <SelectItem value="drill">Vježba</SelectItem>
                  <SelectItem value="meeting">Sastanak</SelectItem>
                  <SelectItem value="event">Događaj</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Datum</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Društvo</label>
              <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VZO">VZO</SelectItem>
                  <SelectItem value="DVD_Kneginec_Gornji">DVD Kneginec Gornji</SelectItem>
                  <SelectItem value="DVD_Donji_Kneginec">DVD Donji Kneginec</SelectItem>
                  <SelectItem value="DVD_Varazdinbreg">DVD Varaždinbreg</SelectItem>
                  <SelectItem value="DVD_Luzan_Biskupecki">DVD Lužan Biškupečki</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Lokacija</label>
              <Input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Opis</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Sudionici</label>
            <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
              {allUsers.filter(u => u.department === formData.department || formData.department === 'VZO').map(user => (
                <div key={user.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.participants.includes(user.id)}
                    onCheckedChange={() => toggleParticipant(user.id)}
                  />
                  <span className="text-sm">{user.full_name} - {user.role}</span>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleUpdate} className="w-full">
            Spremi promjene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Send Message Dialog
const SendMessageDialog = ({ onSend }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    message_type: 'general',
    title: '',
    content: '',
    sent_to_departments: [],
    priority: 'normal'
  });

  const handleSend = async () => {
    if (!formData.title || !formData.content || formData.sent_to_departments.length === 0) {
      alert('Molimo popunite sve obavezne podatke i odaberite primatelje');
      return;
    }

    await onSend(formData);
    setFormData({
      message_type: 'general',
      title: '',
      content: '',
      sent_to_departments: [],
      priority: 'normal'
    });
    setOpen(false);
  };

  const toggleDepartment = (dept) => {
    setFormData(prev => ({
      ...prev,
      sent_to_departments: prev.sent_to_departments.includes(dept)
        ? prev.sent_to_departments.filter(d => d !== dept)
        : [...prev.sent_to_departments, dept]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Pošalji Poruku</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>Pošalji Grupnu Poruku</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Tip poruke</label>
              <Select value={formData.message_type} onValueChange={(value) => setFormData({ ...formData, message_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alert">🚨 Uzbuna</SelectItem>
                  <SelectItem value="drill">🎯 Vježba</SelectItem>
                  <SelectItem value="event">📅 Događaj</SelectItem>
                  <SelectItem value="general">💬 Opća poruka</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Prioritet</label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🚨 HITNO</SelectItem>
                  <SelectItem value="normal">➡️ Normalno</SelectItem>
                  <SelectItem value="low">⬇️ Nisko</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Naslov *</label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Npr. Vježba u nedjelju 10:00"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Poruka *</label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Unesite poruku..."
              rows={5}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Pošalji na (odaberi društva) *</label>
            <div className="space-y-2 border rounded p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.sent_to_departments.includes('all')}
                  onCheckedChange={() => {
                    if (formData.sent_to_departments.includes('all')) {
                      setFormData({ ...formData, sent_to_departments: [] });
                    } else {
                      setFormData({ ...formData, sent_to_departments: ['all'] });
                    }
                  }}
                />
                <span className="font-semibold">📢 SVA DRUŠTVA (VZO)</span>
              </div>
              {!formData.sent_to_departments.includes('all') && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={formData.sent_to_departments.includes('DVD_Kneginec_Gornji')}
                      onCheckedChange={() => toggleDepartment('DVD_Kneginec_Gornji')}
                    />
                    <span>DVD Kneginec Gornji</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={formData.sent_to_departments.includes('DVD_Donji_Kneginec')}
                      onCheckedChange={() => toggleDepartment('DVD_Donji_Kneginec')}
                    />
                    <span>DVD Donji Kneginec</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={formData.sent_to_departments.includes('DVD_Varazdinbreg')}
                      onCheckedChange={() => toggleDepartment('DVD_Varazdinbreg')}
                    />
                    <span>DVD Varaždinbreg</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={formData.sent_to_departments.includes('DVD_Luzan_Biskupecki')}
                      onCheckedChange={() => toggleDepartment('DVD_Luzan_Biskupecki')}
                    />
                    <span>DVD Lužan Biškupečki</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <Button onClick={handleSend} className="w-full">
            📤 Pošalji Poruku
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add Intervention Dialog
const AddInterventionDialog = ({ onAdd, allUsers, vehicles, userDepartment }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    intervention_type: 'fire',
    date: new Date().toISOString().slice(0, 16),
    location: '',
    address: '',
    latitude: '',
    longitude: '',
    departments: userDepartment ? [userDepartment] : [],
    participants: [],
    vehicles_used: [],
    description: '',
    actions_taken: '',
    damage_assessment: '',
    casualties: '',
    status: 'completed'
  });
  const [images, setImages] = useState([]);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      if (file.size > 5000000) {
        alert('Slika je prevelika! Maksimalno 5MB po slici.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => [...prev, e.target.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const toggleParticipant = (userId) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(userId)
        ? prev.participants.filter(id => id !== userId)
        : [...prev.participants, userId]
    }));
  };

  const toggleVehicle = (vehicleId) => {
    setFormData(prev => ({
      ...prev,
      vehicles_used: prev.vehicles_used.includes(vehicleId)
        ? prev.vehicles_used.filter(id => id !== vehicleId)
        : [...prev.vehicles_used, vehicleId]
    }));
  };

  const toggleDepartment = (dept) => {
    setFormData(prev => ({
      ...prev,
      departments: prev.departments.includes(dept)
        ? prev.departments.filter(d => d !== dept)
        : [...prev.departments, dept]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.location || !formData.description) {
      alert('Molimo unesite lokaciju i opis intervencije');
      return;
    }

    if (formData.departments.length === 0) {
      alert('Molimo odaberite barem jedan DVD koji je sudjelovao na intervenciji');
      return;
    }

    const interventionData = {
      ...formData,
      images: images,
      date: new Date(formData.date).toISOString()
    };

    await onAdd(interventionData);
    
    // Reset form
    setFormData({
      intervention_type: 'fire',
      date: new Date().toISOString().slice(0, 16),
      location: '',
      address: '',
      latitude: '',
      longitude: '',
      departments: userDepartment ? [userDepartment] : [],
      participants: [],
      vehicles_used: [],
      description: '',
      actions_taken: '',
      damage_assessment: '',
      casualties: '',
      status: 'completed'
    });
    setImages([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-red-600 hover:bg-red-700">🚒 Novi Izvještaj</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle>🚒 Novi Izvještaj o Intervenciji</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Tip intervencije *</label>
              <Select value={formData.intervention_type} onValueChange={(value) => setFormData({ ...formData, intervention_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fire">🔥 Požar</SelectItem>
                  <SelectItem value="flood">🌊 Poplava</SelectItem>
                  <SelectItem value="accident">🚗 Prometna nesreća</SelectItem>
                  <SelectItem value="rescue">🆘 Spašavanje</SelectItem>
                  <SelectItem value="medical">🚑 Medicinska pomoć</SelectItem>
                  <SelectItem value="technical">🔧 Tehnička intervencija</SelectItem>
                  <SelectItem value="other">📋 Ostalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Datum i vrijeme *</label>
              <Input
                type="datetime-local"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Lokacija *</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Npr. Centar Varaždina"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Adresa</label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Ulica i broj"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">🚒 DVD-ovi na intervenciji * (jedan ili više)</label>
            <div className="border rounded p-3 space-y-2 bg-gray-50">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.departments.includes('DVD_Kneginec_Gornji')}
                  onCheckedChange={() => toggleDepartment('DVD_Kneginec_Gornji')}
                />
                <span className="text-sm">DVD Kneginec Gornji</span>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.departments.includes('DVD_Donji_Kneginec')}
                  onCheckedChange={() => toggleDepartment('DVD_Donji_Kneginec')}
                />
                <span className="text-sm">DVD Donji Kneginec</span>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.departments.includes('DVD_Varazdinbreg')}
                  onCheckedChange={() => toggleDepartment('DVD_Varazdinbreg')}
                />
                <span className="text-sm">DVD Varaždinbreg</span>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.departments.includes('DVD_Luzan_Biskupecki')}
                  onCheckedChange={() => toggleDepartment('DVD_Luzan_Biskupecki')}
                />
                <span className="text-sm">DVD Lužan Biškupečki</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Opis intervencije *</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detaljan opis što se dogodilo..."
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Poduzete mjere</label>
            <Textarea
              value={formData.actions_taken}
              onChange={(e) => setFormData({ ...formData, actions_taken: e.target.value })}
              placeholder="Koje mjere su poduzete..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">👥 Sudionici</label>
            <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
              {allUsers.filter(u => formData.departments.includes(u.department)).map(user => (
                <div key={user.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.participants.includes(user.id)}
                    onCheckedChange={() => toggleParticipant(user.id)}
                  />
                  <span className="text-sm">{user.full_name}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">🚒 Korištena vozila</label>
            <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
              {vehicles.filter(v => formData.departments.includes(v.department)).map(vehicle => (
                <div key={vehicle.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.vehicles_used.includes(vehicle.id)}
                    onCheckedChange={() => toggleVehicle(vehicle.id)}
                  />
                  <span className="text-sm">{vehicle.name} ({vehicle.license_plate})</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">📸 Fotografije (max 10)</label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              disabled={images.length >= 10}
            />
            {images.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mt-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img src={img} alt={`Slika ${idx + 1}`} className="w-full h-20 object-cover rounded" />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} className="w-full bg-red-600 hover:bg-red-700">
            💾 Spremi Izvještaj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Update Intervention Dialog (simplified version)
const InterventionUpdateDialog = ({ intervention, onUpdate, allUsers, vehicles }) => {
  const [open, setOpen] = useState(false);
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Uredi</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uredi Izvještaj</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">Funkcionalnost uređivanja u razvoju...</p>
      </DialogContent>
    </Dialog>
  );
};

// Chat Input Component
const ChatInput = ({ onSend }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Napišite poruku..."
        rows={2}
        className="flex-1"
      />
      <Button onClick={handleSend} className="bg-blue-600">
        Pošalji
      </Button>
    </div>
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

// Logo Management Panel Component
const LogoManagementPanel = () => {
  const [logos, setLogos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [newLogoUrl, setNewLogoUrl] = useState('');

  useEffect(() => {
    fetchLogos();
  }, []);

  const fetchLogos = async () => {
    try {
      const response = await axios.get(`${API}/dvd-logos`);
      setLogos(response.data);
    } catch (error) {
      console.error('Error fetching logos:', error);
    }
  };

  const initializeLogos = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/init-logos`);
      fetchLogos();
      alert('✅ Grbovi uspješno inicijalizirani!');
    } catch (error) {
      console.error('Error initializing logos:', error);
      alert('❌ Greška pri inicijalizaciji grbova');
    } finally {
      setLoading(false);
    }
  };

  const updateLogo = async (department) => {
    if (!newLogoUrl) {
      alert('Molimo unesite URL grba');
      return;
    }

    setLoading(true);
    try {
      await axios.put(`${API}/dvd-logos/${department}?logo_url=${encodeURIComponent(newLogoUrl)}`);
      fetchLogos();
      setEditingDept(null);
      setNewLogoUrl('');
      alert('✅ Grb uspješno ažuriran!');
    } catch (error) {
      console.error('Error updating logo:', error);
      alert('❌ Greška pri ažuriranju grba');
    } finally {
      setLoading(false);
    }
  };

  const deptNames = {
    'DVD_Kneginec_Gornji': 'DVD Kneginec Gornji',
    'DVD_Donji_Kneginec': 'DVD Donji Kneginec',
    'DVD_Varazdinbreg': 'DVD Varaždinbreg',
    'DVD_Luzan_Biskupecki': 'DVD Lužan Biškupečki',
    'VZO': 'VZO Gornji Kneginec'
  };

  return (
    <div className="space-y-4">
      {logos.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">Grbovi još nisu inicijalizirani</p>
          <Button onClick={initializeLogos} disabled={loading} className="bg-red-600">
            {loading ? 'Inicijalizacija...' : '🎨 Inicijaliziraj Grbove'}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">Upravljajte grbovima svih DVD-ova</p>
            <Button onClick={fetchLogos} variant="outline" size="sm">
              Osvježi
            </Button>
          </div>

          <div className="grid gap-4">
            {logos.map((logo) => (
              <div key={logo.department} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <img 
                      src={logo.logo_url} 
                      alt={deptNames[logo.department]}
                      className="w-20 h-20 object-contain border rounded"
                      onError={(e) => e.target.src = 'https://via.placeholder.com/80?text=Logo'}
                    />
                    <div>
                      <h3 className="font-bold text-lg">{deptNames[logo.department]}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Zadnje ažurirano: {new Date(logo.updated_at).toLocaleString()}
                      </p>
                      {editingDept === logo.department ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            type="url"
                            placeholder="Novi URL grba"
                            value={newLogoUrl}
                            onChange={(e) => setNewLogoUrl(e.target.value)}
                            className="w-96"
                          />
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              onClick={() => updateLogo(logo.department)}
                              disabled={loading}
                            >
                              💾 Spremi
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setEditingDept(null);
                                setNewLogoUrl('');
                              }}
                            >
                              Odustani
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            setEditingDept(logo.department);
                            setNewLogoUrl(logo.logo_url);
                          }}
                        >
                          ✏️ Promijeni Grb
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
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