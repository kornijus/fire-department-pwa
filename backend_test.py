import requests
import sys
import json
from datetime import datetime

class FirefighterAPITester:
    def __init__(self, base_url="https://fire-community.preview.emergentagent.com"):
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

def main():
    print("🚒 Starting Firefighter Community API Tests")
    print("=" * 60)
    
    tester = FirefighterAPITester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("User Registration (Zapovjednik)", tester.test_register_user_zapovjednik),
        ("VZO User Registration", tester.test_register_vzo_user),
        ("User Registration (Member)", tester.test_register_user_member),
        ("User Login", tester.test_login),
        ("Get User Profile", tester.test_get_me),
        ("Get All Users", tester.test_get_users),
        ("Get Active Locations", tester.test_get_active_locations),
        ("Get Hydrants", tester.test_get_hydrants),
        ("Create Nadzemni Hydrant", tester.test_create_hydrant_nadzemni),
        ("Create Podzemni Hydrant", tester.test_create_hydrant_podzemni),
        ("Update Hydrant", tester.test_update_hydrant),
        ("VZO Permissions", tester.test_vzo_permissions),
        ("Unauthorized Access", tester.test_unauthorized_access),
        ("Role Restrictions", tester.test_member_role_restrictions),
        ("All VZO Roles", tester.test_all_vzo_roles),
        ("All Departments and Roles", tester.test_all_departments_and_roles),
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