import requests
import sys
import json
from datetime import datetime

class FirefighterAPITester:
    def __init__(self, base_url="https://responderapp.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_data = None
        self.member_data = None
        self.vzo_user_data = None
        self.member_token = None
        self.vzo_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_hydrant_id = None
        self.created_podzemni_id = None
        self.created_vehicle_id = None
        self.created_equipment_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        print(f"   Method: {method}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ FAILED - Exception: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        return self.run_test("Root API Endpoint", "GET", "", 200)

    def test_register_user_zapovjednik(self):
        """Test user registration with zapovjednik role from DVD_Kneginec_Gornji"""
        timestamp = datetime.now().strftime('%H%M%S')
        user_data = {
            "username": f"zapovjednik{timestamp}",
            "email": f"zapovjednik{timestamp}@vatrogasci.hr",
            "password": "TestPass123!",
            "full_name": "Test Zapovjednik",
            "department": "DVD_Kneginec_Gornji",
            "role": "zapovjednik",
            "is_vzo_member": False
        }
        
        success, response = self.run_test(
            "User Registration (Zapovjednik from DVD_Kneginec_Gornji)",
            "POST",
            "register",
            200,
            data=user_data
        )
        
        if success:
            self.user_data = user_data
            print(f"   ✅ User registered: {user_data['username']} - {user_data['role']} at {user_data['department']}")
        
        return success

    def test_register_vzo_user(self):
        """Test VZO user registration with predsjednik_vzo role"""
        timestamp = datetime.now().strftime('%H%M%S')
        vzo_user_data = {
            "username": f"vzo_predsjednik{timestamp}",
            "email": f"vzo_predsjednik{timestamp}@vatrogasci.hr",
            "password": "TestPass123!",
            "full_name": "Test VZO Predsjednik",
            "department": "VZO",
            "role": "predsjednik_vzo",
            "is_vzo_member": True
        }
        
        success, response = self.run_test(
            "VZO User Registration (Predsjednik VZO)",
            "POST",
            "register",
            200,
            data=vzo_user_data
        )
        
        if success:
            self.vzo_user_data = vzo_user_data
            print(f"   ✅ VZO User registered: {vzo_user_data['username']} - {vzo_user_data['role']} at {vzo_user_data['department']}")
        
        return success

    def test_register_user_member(self):
        """Test user registration with clan_bez_funkcije role"""
        timestamp = datetime.now().strftime('%H%M%S')
        member_data = {
            "username": f"member{timestamp}",
            "email": f"member{timestamp}@vatrogasci.hr",
            "password": "TestPass123!",
            "full_name": "Test Member",
            "department": "DVD_Donji_Kneginec",
            "role": "clan_bez_funkcije",
            "is_vzo_member": False
        }
        
        success, response = self.run_test(
            "User Registration (Member without function)",
            "POST",
            "register",
            200,
            data=member_data
        )
        
        if success:
            self.member_data = member_data
            print(f"   ✅ Member registered: {member_data['username']} - {member_data['role']} at {member_data['department']}")
        
        return success

    def test_login(self):
        """Test user login and get JWT token"""
        if not self.user_data:
            print("❌ No user data available for login test")
            return False
            
        login_data = {
            "username": self.user_data["username"],
            "password": self.user_data["password"]
        }
        
        success, response = self.run_test(
            "User Login",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   ✅ Token received: {self.token[:20]}...")
            return True
        return False

    def test_get_me(self):
        """Test getting current user profile"""
        return self.run_test("Get User Profile", "GET", "me", 200)

    def test_get_users(self):
        """Test getting all users (operative/admin only)"""
        return self.run_test("Get All Users", "GET", "users", 200)

    def test_get_active_locations(self):
        """Test getting active user locations"""
        return self.run_test("Get Active Locations", "GET", "locations/active", 200)

    def test_get_hydrants(self):
        """Test getting all hydrants (public access)"""
        return self.run_test("Get All Hydrants", "GET", "hydrants", 200)

    def test_create_hydrant_nadzemni(self):
        """Test creating a new nadzemni (above-ground) hydrant"""
        hydrant_data = {
            "latitude": 45.123456,
            "longitude": 15.654321,
            "status": "working",
            "tip_hidranta": "nadzemni",
            "notes": "Test nadzemni hydrant created by automated test",
            "images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="]
        }
        
        success, response = self.run_test(
            "Create Nadzemni Hydrant",
            "POST",
            "hydrants",
            200,
            data=hydrant_data
        )
        
        if success and 'id' in response:
            self.created_hydrant_id = response['id']
            print(f"   ✅ Nadzemni Hydrant created with ID: {self.created_hydrant_id}")
        
        return success

    def test_create_hydrant_podzemni(self):
        """Test creating a new podzemni (underground) hydrant"""
        hydrant_data = {
            "latitude": 45.123789,
            "longitude": 15.654987,
            "status": "working",
            "tip_hidranta": "podzemni",
            "notes": "Test podzemni hydrant created by automated test",
            "images": []
        }
        
        success, response = self.run_test(
            "Create Podzemni Hydrant",
            "POST",
            "hydrants",
            200,
            data=hydrant_data
        )
        
        if success and 'id' in response:
            self.created_podzemni_id = response['id']
            print(f"   ✅ Podzemni Hydrant created with ID: {self.created_podzemni_id}")
        
        return success

    def test_update_hydrant(self):
        """Test updating hydrant status and type"""
        if not self.created_hydrant_id:
            print("❌ No hydrant ID available for update test")
            return False
            
        update_data = {
            "status": "maintenance",
            "tip_hidranta": "podzemni",
            "notes": "Updated by automated test - maintenance required, changed to podzemni",
            "images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="]
        }
        
        return self.run_test(
            "Update Hydrant (Status, Type, Images)",
            "PUT",
            f"hydrants/{self.created_hydrant_id}",
            200,
            data=update_data
        )

    def test_delete_hydrant(self):
        """Test deleting a hydrant (NEW: Main fix to test)"""
        if not self.created_podzemni_id:
            print("❌ No podzemni hydrant ID available for delete test")
            return False
            
        success = self.run_test(
            "Delete Hydrant (NEW FUNCTIONALITY)",
            "DELETE",
            f"hydrants/{self.created_podzemni_id}",
            200
        )
        
        if success:
            print(f"   ✅ Hydrant {self.created_podzemni_id} successfully deleted")
            # Verify hydrant is actually deleted by trying to get all hydrants
            success_verify, response = self.run_test(
                "Verify Hydrant Deletion",
                "GET",
                "hydrants",
                200
            )
            if success_verify:
                hydrant_ids = [h.get('id') for h in response if isinstance(response, list)]
                if self.created_podzemni_id not in hydrant_ids:
                    print(f"   ✅ Confirmed: Deleted hydrant {self.created_podzemni_id} not in hydrant list")
                    return True
                else:
                    print(f"   ❌ Error: Deleted hydrant {self.created_podzemni_id} still appears in hydrant list")
                    return False
        
        return success

    def test_login_specific_user(self):
        """Test login with specific user from review request: test_zapovjednik_final"""
        login_data = {
            "username": "test_zapovjednik_final",
            "password": "password123"
        }
        
        success, response = self.run_test(
            "Login Specific User (test_zapovjednik_final)",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response.get('user', {})
            print(f"   ✅ Specific user logged in: {login_data['username']}")
            print(f"   ✅ User role: {self.user_data.get('role', 'Unknown')}")
            print(f"   ✅ User department: {self.user_data.get('department', 'Unknown')}")
            print(f"   ✅ VZO member: {self.user_data.get('is_vzo_member', False)}")
            return True
        return False

    def test_unauthorized_access(self):
        """Test accessing protected endpoints without token"""
        # Temporarily remove token
        temp_token = self.token
        self.token = None
        
        success, _ = self.run_test(
            "Unauthorized Access Test",
            "GET",
            "users",
            401  # Should return 401 Unauthorized
        )
        
        # Restore token
        self.token = temp_token
        return success

    def test_member_role_restrictions(self):
        """Test that member role cannot access management features"""
        if not hasattr(self, 'member_data') or not self.member_data:
            print("❌ No member data available for role restriction test")
            return False
            
        # Login as member
        login_data = {
            "username": self.member_data["username"],
            "password": self.member_data["password"]
        }
        
        success, response = self.run_test(
            "Member Login",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            # Store current management token
            temp_token = self.token
            self.member_token = response['access_token']
            self.token = self.member_token
            
            # Test that member cannot access users endpoint
            success_users, _ = self.run_test(
                "Member Access to Users (Should Fail)",
                "GET",
                "users",
                403  # Should return 403 Forbidden
            )
            
            # Test that member cannot create hydrant
            hydrant_data = {
                "latitude": 45.123456,
                "longitude": 15.654321,
                "status": "working",
                "notes": "Test hydrant by member (should fail)"
            }
            
            success_hydrant, _ = self.run_test(
                "Member Create Hydrant (Should Fail)",
                "POST",
                "hydrants",
                403,  # Should return 403 Forbidden
                data=hydrant_data
            )
            
            # Restore management token
            self.token = temp_token
            
            return success_users and success_hydrant
        
        return False

    def test_vzo_permissions(self):
        """Test VZO user permissions and access"""
        if not hasattr(self, 'vzo_user_data') or not self.vzo_user_data:
            print("❌ No VZO user data available for permission test")
            return False
            
        # Login as VZO user
        login_data = {
            "username": self.vzo_user_data["username"],
            "password": self.vzo_user_data["password"]
        }
        
        success, response = self.run_test(
            "VZO User Login",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            # Store current token
            temp_token = self.token
            self.vzo_token = response['access_token']
            self.token = self.vzo_token
            
            # Test that VZO user can access all users
            success_users, _ = self.run_test(
                "VZO Access to All Users",
                "GET",
                "users",
                200
            )
            
            # Test that VZO user can create hydrant
            hydrant_data = {
                "latitude": 45.987654,
                "longitude": 15.123456,
                "status": "working",
                "tip_hidranta": "nadzemni",
                "notes": "Test hydrant by VZO user"
            }
            
            success_hydrant, response_hydrant = self.run_test(
                "VZO Create Hydrant",
                "POST",
                "hydrants",
                200,
                data=hydrant_data
            )
            
            # Restore original token
            self.token = temp_token
            
            return success_users and success_hydrant
        
        return False

    def test_all_vzo_roles(self):
        """Test registration with all VZO roles"""
        vzo_roles = [
            "predsjednik_vzo",
            "zamjenik_predsjednika_vzo", 
            "tajnik_vzo",
            "zapovjednik_vzo",
            "zamjenik_zapovjednika_vzo"
        ]
        
        print("🔍 Testing All VZO Roles...")
        print(f"   VZO Roles: {len(vzo_roles)}")
        
        all_passed = True
        for role in vzo_roles:
            timestamp = datetime.now().strftime('%H%M%S%f')[:10]
            test_data = {
                "username": f"vzo_{role}_{timestamp}",
                "email": f"vzo_{role}_{timestamp}@vatrogasci.hr",
                "password": "TestPass123!",
                "full_name": f"Test VZO {role}",
                "department": "VZO",
                "role": role,
                "is_vzo_member": True
            }
            
            success, _ = self.run_test(
                f"Register VZO {role}",
                "POST",
                "register",
                200,
                data=test_data
            )
            
            if not success:
                all_passed = False
        
        return all_passed

    def test_all_departments_and_roles(self):
        """Test registration with all departments and roles"""
        departments = [
            "DVD_Kneginec_Gornji",
            "DVD_Donji_Kneginec", 
            "DVD_Varazdinbreg",
            "DVD_Luzan_Biskupecki"
        ]
        
        roles = [
            "clan_bez_funkcije",
            "predsjednik", 
            "tajnik",
            "zapovjednik",
            "zamjenik_zapovjednika",
            "spremistar",
            "blagajnik",
            "upravni_odbor",
            "nadzorni_odbor",
            "zapovjednistvo"
        ]
        
        print("🔍 Testing All Departments and Roles...")
        print(f"   Departments: {len(departments)}")
        print(f"   Roles: {len(roles)}")
        
        # Test a few combinations to verify structure
        test_combinations = [
            ("DVD_Kneginec_Gornji", "zapovjednik"),
            ("DVD_Donji_Kneginec", "clan_bez_funkcije"),
            ("DVD_Varazdinbreg", "predsjednik"),
            ("DVD_Luzan_Biskupecki", "tajnik")
        ]
        
        all_passed = True
        for dept, role in test_combinations:
            timestamp = datetime.now().strftime('%H%M%S%f')[:10]  # More unique timestamp
            test_data = {
                "username": f"test_{role}_{timestamp}",
                "email": f"test_{role}_{timestamp}@vatrogasci.hr",
                "password": "TestPass123!",
                "full_name": f"Test {role}",
                "department": dept,
                "role": role
            }
            
            success, _ = self.run_test(
                f"Register {role} at {dept}",
                "POST",
                "register",
                200,
                data=test_data
            )
            
            if not success:
                all_passed = False
        
        return all_passed

    # NEW: Vehicle Management Tests
    def test_get_vehicles(self):
        """Test getting all vehicles (authenticated users only)"""
        return self.run_test("Get All Vehicles", "GET", "vehicles", 200)

    def test_create_vehicle(self):
        """Test creating a new vehicle with comprehensive data"""
        vehicle_data = {
            "name": "Test Fire Truck Alpha",
            "type": "cisterna",
            "license_plate": "ZG-1234-AB",
            "department": "DVD_Kneginec_Gornji",
            "year": 2020,
            "technical_inspection_date": "2024-01-15T10:00:00Z",
            "technical_inspection_valid_until": "2025-01-15T10:00:00Z",
            "last_service_date": "2024-06-01T09:00:00Z",
            "next_service_due": "2024-12-01T09:00:00Z",
            "service_km": 45000,
            "current_km": 47500,
            "status": "active",
            "notes": "Test vehicle created by automated testing"
        }
        
        success, response = self.run_test(
            "Create Vehicle with Full Details",
            "POST",
            "vehicles",
            200,
            data=vehicle_data
        )
        
        if success and 'id' in response:
            self.created_vehicle_id = response['id']
            print(f"   ✅ Vehicle created with ID: {self.created_vehicle_id}")
        
        return success

    def test_update_vehicle(self):
        """Test updating vehicle details"""
        if not self.created_vehicle_id:
            print("❌ No vehicle ID available for update test")
            return False
            
        update_data = {
            "status": "maintenance",
            "current_km": 48000,
            "notes": "Updated by automated test - scheduled maintenance"
        }
        
        return self.run_test(
            "Update Vehicle Details",
            "PUT",
            f"vehicles/{self.created_vehicle_id}",
            200,
            data=update_data
        )

    def test_delete_vehicle(self):
        """Test deleting a vehicle"""
        if not self.created_vehicle_id:
            print("❌ No vehicle ID available for delete test")
            return False
            
        success = self.run_test(
            "Delete Vehicle",
            "DELETE",
            f"vehicles/{self.created_vehicle_id}",
            200
        )
        
        if success:
            print(f"   ✅ Vehicle {self.created_vehicle_id} successfully deleted")
            # Verify vehicle is actually deleted
            success_verify, response = self.run_test(
                "Verify Vehicle Deletion",
                "GET",
                "vehicles",
                200
            )
            if success_verify:
                vehicle_ids = [v.get('id') for v in response if isinstance(response, list)]
                if self.created_vehicle_id not in vehicle_ids:
                    print(f"   ✅ Confirmed: Deleted vehicle {self.created_vehicle_id} not in vehicle list")
                    return True
                else:
                    print(f"   ❌ Error: Deleted vehicle {self.created_vehicle_id} still appears in vehicle list")
                    return False
        
        return success

    # NEW: Equipment Management Tests
    def test_get_equipment(self):
        """Test getting all equipment (authenticated users only)"""
        return self.run_test("Get All Equipment", "GET", "equipment", 200)

    def test_create_equipment(self):
        """Test creating new equipment with assignment options"""
        equipment_data = {
            "name": "Test Fire Helmet Alpha",
            "type": "helmet",
            "serial_number": "HLM-2024-001",
            "department": "DVD_Kneginec_Gornji",
            "location": "Station Storage Room A",
            "last_inspection_date": "2024-01-10T08:00:00Z",
            "next_inspection_due": "2025-01-10T08:00:00Z",
            "condition": "good",
            "assigned_to_user": None,
            "assigned_to_vehicle": None,
            "notes": "Test equipment created by automated testing"
        }
        
        success, response = self.run_test(
            "Create Equipment with Full Details",
            "POST",
            "equipment",
            200,
            data=equipment_data
        )
        
        if success and 'id' in response:
            self.created_equipment_id = response['id']
            print(f"   ✅ Equipment created with ID: {self.created_equipment_id}")
        
        return success

    def test_create_equipment_assigned_to_vehicle(self):
        """Test creating equipment assigned to a vehicle"""
        # First create a vehicle to assign to
        vehicle_data = {
            "name": "Test Equipment Vehicle",
            "type": "kombi",
            "license_plate": "ZG-5678-CD",
            "department": "DVD_Kneginec_Gornji",
            "status": "active"
        }
        
        vehicle_success, vehicle_response = self.run_test(
            "Create Vehicle for Equipment Assignment",
            "POST",
            "vehicles",
            200,
            data=vehicle_data
        )
        
        if not vehicle_success or 'id' not in vehicle_response:
            print("❌ Failed to create vehicle for equipment assignment test")
            return False
            
        vehicle_id = vehicle_response['id']
        
        # Now create equipment assigned to this vehicle
        equipment_data = {
            "name": "Vehicle Fire Extinguisher",
            "type": "extinguisher",
            "serial_number": "EXT-2024-002",
            "department": "DVD_Kneginec_Gornji",
            "location": "Vehicle Storage",
            "condition": "good",
            "assigned_to_vehicle": vehicle_id,
            "notes": "Fire extinguisher assigned to test vehicle"
        }
        
        return self.run_test(
            "Create Equipment Assigned to Vehicle",
            "POST",
            "equipment",
            200,
            data=equipment_data
        )

    def test_update_equipment(self):
        """Test updating equipment details and assignments"""
        if not self.created_equipment_id:
            print("❌ No equipment ID available for update test")
            return False
            
        update_data = {
            "condition": "needs_maintenance",
            "location": "Maintenance Workshop",
            "notes": "Updated by automated test - needs inspection"
        }
        
        return self.run_test(
            "Update Equipment Details",
            "PUT",
            f"equipment/{self.created_equipment_id}",
            200,
            data=update_data
        )

    def test_delete_equipment(self):
        """Test deleting equipment"""
        if not self.created_equipment_id:
            print("❌ No equipment ID available for delete test")
            return False
            
        success = self.run_test(
            "Delete Equipment",
            "DELETE",
            f"equipment/{self.created_equipment_id}",
            200
        )
        
        if success:
            print(f"   ✅ Equipment {self.created_equipment_id} successfully deleted")
            # Verify equipment is actually deleted
            success_verify, response = self.run_test(
                "Verify Equipment Deletion",
                "GET",
                "equipment",
                200
            )
            if success_verify:
                equipment_ids = [e.get('id') for e in response if isinstance(response, list)]
                if self.created_equipment_id not in equipment_ids:
                    print(f"   ✅ Confirmed: Deleted equipment {self.created_equipment_id} not in equipment list")
                    return True
                else:
                    print(f"   ❌ Error: Deleted equipment {self.created_equipment_id} still appears in equipment list")
                    return False
        
        return success

    def test_vehicle_permission_restrictions(self):
        """Test that only users with management permissions can manage vehicles"""
        if not hasattr(self, 'member_data') or not self.member_data:
            print("❌ No member data available for vehicle permission test")
            return False
            
        # Login as member (should not have vehicle management permissions)
        login_data = {
            "username": self.member_data["username"],
            "password": self.member_data["password"]
        }
        
        success, response = self.run_test(
            "Member Login for Vehicle Permission Test",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            # Store current token
            temp_token = self.token
            self.token = response['access_token']
            
            # Test that member cannot create vehicle
            vehicle_data = {
                "name": "Unauthorized Vehicle",
                "type": "kombi",
                "license_plate": "ZG-9999-XX",
                "department": "DVD_Donji_Kneginec",
                "status": "active"
            }
            
            success_create, _ = self.run_test(
                "Member Create Vehicle (Should Fail)",
                "POST",
                "vehicles",
                403,  # Should return 403 Forbidden
                data=vehicle_data
            )
            
            # Restore management token
            self.token = temp_token
            
            return success_create
        
        return False

    def test_equipment_permission_restrictions(self):
        """Test that only users with management permissions can manage equipment"""
        if not hasattr(self, 'member_data') or not self.member_data:
            print("❌ No member data available for equipment permission test")
            return False
            
        # Login as member (should not have equipment management permissions)
        login_data = {
            "username": self.member_data["username"],
            "password": self.member_data["password"]
        }
        
        success, response = self.run_test(
            "Member Login for Equipment Permission Test",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            # Store current token
            temp_token = self.token
            self.token = response['access_token']
            
            # Test that member cannot create equipment
            equipment_data = {
                "name": "Unauthorized Equipment",
                "type": "helmet",
                "department": "DVD_Donji_Kneginec",
                "location": "Storage",
                "condition": "good"
            }
            
            success_create, _ = self.run_test(
                "Member Create Equipment (Should Fail)",
                "POST",
                "equipment",
                403,  # Should return 403 Forbidden
                data=equipment_data
            )
            
            # Restore management token
            self.token = temp_token
            
            return success_create
        
        return False

    def test_department_filtering(self):
        """Test that DVD users only see their department's vehicles and equipment"""
        # This test assumes we have a DVD user (non-VZO) logged in
        if not self.user_data or self.user_data.get('is_vzo_member', False):
            print("❌ Need DVD (non-VZO) user for department filtering test")
            return False
            
        # Get vehicles and check department filtering
        success_vehicles, vehicles_response = self.run_test(
            "Get Vehicles (Department Filtering)",
            "GET",
            "vehicles",
            200
        )
        
        success_equipment, equipment_response = self.run_test(
            "Get Equipment (Department Filtering)",
            "GET",
            "equipment",
            200
        )
        
        if success_vehicles and success_equipment:
            user_department = self.user_data.get('department')
            
            # Check that all vehicles belong to user's department
            if isinstance(vehicles_response, list):
                for vehicle in vehicles_response:
                    if vehicle.get('department') != user_department:
                        print(f"   ❌ Found vehicle from different department: {vehicle.get('department')} (user: {user_department})")
                        return False
                print(f"   ✅ All vehicles belong to user's department: {user_department}")
            
            # Check that all equipment belongs to user's department
            if isinstance(equipment_response, list):
                for equipment in equipment_response:
                    if equipment.get('department') != user_department:
                        print(f"   ❌ Found equipment from different department: {equipment.get('department')} (user: {user_department})")
                        return False
                print(f"   ✅ All equipment belongs to user's department: {user_department}")
            
            return True
        
        return False

    def test_data_validation(self):
        """Test API data validation with invalid data"""
        # Test invalid vehicle data
        invalid_vehicle_data = {
            "name": "",  # Empty name should fail
            "type": "invalid_type",
            "license_plate": "",
            "department": ""
        }
        
        success_invalid_vehicle, _ = self.run_test(
            "Create Vehicle with Invalid Data (Should Fail)",
            "POST",
            "vehicles",
            422,  # Should return 422 Validation Error
            data=invalid_vehicle_data
        )
        
        # Test invalid equipment data
        invalid_equipment_data = {
            "name": "",  # Empty name should fail
            "type": "",
            "department": ""
        }
        
        success_invalid_equipment, _ = self.run_test(
            "Create Equipment with Invalid Data (Should Fail)",
            "POST",
            "equipment",
            422,  # Should return 422 Validation Error
            data=invalid_equipment_data
        )
        
        return success_invalid_vehicle and success_invalid_equipment

    # NEW: PDF Generation Tests
    def test_pdf_evidencijski_list_dvd(self):
        """Test PDF generation for evidencijski list - DVD department"""
        success, response = self.run_test(
            "Generate Evidencijski List PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/evidencijski-list/DVD_Kneginec_Gornji",
            200
        )
        
        if success:
            # Check if response is PDF content (binary data)
            print(f"   ✅ PDF generated successfully for DVD_Kneginec_Gornji")
            return True
        return False

    def test_pdf_evidencijski_list_vzo(self):
        """Test PDF generation for evidencijski list - VZO (all members)"""
        success, response = self.run_test(
            "Generate Evidencijski List PDF (VZO - All Members)",
            "GET",
            "pdf/evidencijski-list/VZO",
            200
        )
        
        if success:
            print(f"   ✅ PDF generated successfully for VZO (all members)")
            return True
        return False

    def test_pdf_oprema_vozilo_dvd(self):
        """Test PDF generation for vehicle equipment - DVD department"""
        success, response = self.run_test(
            "Generate Vehicle Equipment PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/oprema-vozilo/DVD_Kneginec_Gornji",
            200
        )
        
        if success:
            print(f"   ✅ Vehicle equipment PDF generated successfully for DVD_Kneginec_Gornji")
            return True
        return False

    def test_pdf_oprema_vozilo_vzo(self):
        """Test PDF generation for vehicle equipment - VZO (all vehicles)"""
        success, response = self.run_test(
            "Generate Vehicle Equipment PDF (VZO - All Vehicles)",
            "GET",
            "pdf/oprema-vozilo/VZO",
            200
        )
        
        if success:
            print(f"   ✅ Vehicle equipment PDF generated successfully for VZO (all vehicles)")
            return True
        return False

    def test_pdf_oprema_spremiste_dvd(self):
        """Test PDF generation for storage equipment - DVD department"""
        success, response = self.run_test(
            "Generate Storage Equipment PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/oprema-spremiste/DVD_Kneginec_Gornji",
            200
        )
        
        if success:
            print(f"   ✅ Storage equipment PDF generated successfully for DVD_Kneginec_Gornji")
            return True
        return False

    def test_pdf_osobno_zaduzenje(self):
        """Test PDF generation for personal equipment assignment"""
        # First, we need to get a user ID to test with
        success_users, users_response = self.run_test(
            "Get Users for PDF Test",
            "GET",
            "users",
            200
        )
        
        if not success_users or not isinstance(users_response, list) or len(users_response) == 0:
            print("❌ No users available for personal assignment PDF test")
            return False
        
        # Use the first user from the list
        test_user = users_response[0]
        user_id = test_user.get('id')
        
        if not user_id:
            print("❌ No valid user ID found for personal assignment PDF test")
            return False
        
        success, response = self.run_test(
            f"Generate Personal Assignment PDF (User: {test_user.get('full_name', 'Unknown')})",
            "GET",
            f"pdf/osobno-zaduzenje/{user_id}",
            200
        )
        
        if success:
            print(f"   ✅ Personal assignment PDF generated successfully for user {test_user.get('full_name', user_id)}")
            return True
        return False

    def test_pdf_authentication_required(self):
        """Test that PDF endpoints require authentication"""
        # Temporarily remove token
        temp_token = self.token
        self.token = None
        
        success, _ = self.run_test(
            "PDF Access Without Authentication (Should Fail)",
            "GET",
            "pdf/evidencijski-list/DVD_Kneginec_Gornji",
            401  # Should return 401 Unauthorized
        )
        
        # Restore token
        self.token = temp_token
        return success

    def test_pdf_invalid_department(self):
        """Test PDF generation with invalid department"""
        success, _ = self.run_test(
            "PDF Generation with Invalid Department (Should Fail)",
            "GET",
            "pdf/evidencijski-list/INVALID_DEPARTMENT",
            200  # Should still return 200 but with empty data
        )
        
        return success

    def test_pdf_invalid_user_id(self):
        """Test personal assignment PDF with invalid user ID"""
        success, _ = self.run_test(
            "Personal Assignment PDF with Invalid User ID (Should Fail)",
            "GET",
            "pdf/osobno-zaduzenje/invalid-user-id-12345",
            404  # Should return 404 Not Found
        )
        
        return success

    def test_pdf_content_type_headers(self):
        """Test that PDF endpoints return correct content type and headers"""
        url = f"{self.api_url}/pdf/evidencijski-list/DVD_Kneginec_Gornji"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                content_disposition = response.headers.get('Content-Disposition', '')
                
                print(f"   Content-Type: {content_type}")
                print(f"   Content-Disposition: {content_disposition}")
                
                # Check if content type is PDF
                if 'application/pdf' in content_type:
                    print(f"   ✅ Correct Content-Type: {content_type}")
                else:
                    print(f"   ❌ Incorrect Content-Type: {content_type}")
                    return False
                
                # Check if content disposition indicates attachment
                if 'attachment' in content_disposition and 'filename=' in content_disposition:
                    print(f"   ✅ Correct Content-Disposition: {content_disposition}")
                else:
                    print(f"   ❌ Incorrect Content-Disposition: {content_disposition}")
                    return False
                
                # Check if response has content (PDF size > 0)
                content_length = len(response.content)
                if content_length > 0:
                    print(f"   ✅ PDF file size: {content_length} bytes")
                    return True
                else:
                    print(f"   ❌ PDF file is empty")
                    return False
            else:
                print(f"   ❌ Failed to get PDF: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"   ❌ Exception during PDF header test: {str(e)}")
            return False

def main():
    print("🚒 Starting Firefighter Community API Tests")
    print("=" * 60)
    
    tester = FirefighterAPITester()
    
    # Test sequence - UPDATED for vehicle and equipment management testing
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("User Registration (Zapovjednik)", tester.test_register_user_zapovjednik),
        ("VZO User Registration", tester.test_register_vzo_user),
        ("User Registration (Member)", tester.test_register_user_member),
        ("User Login", tester.test_login),
        ("Get User Profile", tester.test_get_me),
        
        # Vehicle Management Tests (HIGH PRIORITY)
        ("Get All Vehicles", tester.test_get_vehicles),
        ("Create Vehicle with Full Details", tester.test_create_vehicle),
        ("Update Vehicle Details", tester.test_update_vehicle),
        ("Delete Vehicle", tester.test_delete_vehicle),
        
        # Equipment Management Tests (HIGH PRIORITY)
        ("Get All Equipment", tester.test_get_equipment),
        ("Create Equipment with Full Details", tester.test_create_equipment),
        ("Create Equipment Assigned to Vehicle", tester.test_create_equipment_assigned_to_vehicle),
        ("Update Equipment Details", tester.test_update_equipment),
        ("Delete Equipment", tester.test_delete_equipment),
        
        # Permission Testing (HIGH PRIORITY)
        ("Vehicle Permission Restrictions", tester.test_vehicle_permission_restrictions),
        ("Equipment Permission Restrictions", tester.test_equipment_permission_restrictions),
        ("Department Filtering", tester.test_department_filtering),
        
        # Data Validation Testing
        ("Data Validation", tester.test_data_validation),
        
        # Existing Tests
        ("Get Hydrants", tester.test_get_hydrants),
        ("Create Nadzemni Hydrant", tester.test_create_hydrant_nadzemni),
        ("Create Podzemni Hydrant", tester.test_create_hydrant_podzemni),
        ("Update Hydrant", tester.test_update_hydrant),
        ("Delete Hydrant", tester.test_delete_hydrant),
        ("Get All Users", tester.test_get_users),
        ("Get Active Locations", tester.test_get_active_locations),
        ("VZO Permissions", tester.test_vzo_permissions),
        ("Unauthorized Access", tester.test_unauthorized_access),
        ("Role Restrictions", tester.test_member_role_restrictions),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print final results
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {tester.tests_run}")
    print(f"Passed: {tester.tests_passed}")
    print(f"Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed Tests:")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print(f"\n✅ All tests passed!")
    
    print("\n🔧 Test Environment:")
    print(f"   Backend URL: {tester.base_url}")
    print(f"   API URL: {tester.api_url}")
    if tester.user_data:
        print(f"   Test User: {tester.user_data['username']}")
    if tester.created_hydrant_id:
        print(f"   Test Hydrant ID: {tester.created_hydrant_id}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())