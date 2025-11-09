import requests
import sys
import json
from datetime import datetime

class AdditionalFirefighterAPITester:
    def __init__(self, base_url="https://emergencypwa.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:300]}...")
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

    def login_vzo_user(self):
        """Login with VZO credentials from review request"""
        login_data = {
            "username": "vzo_predsjednik",
            "password": "VZOPass123"
        }
        
        success, response = self.run_test(
            "Login VZO Admin (vzo_predsjednik)",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   ✅ VZO Admin logged in successfully")
            print(f"   ✅ User role: {response.get('user', {}).get('role', 'Unknown')}")
            print(f"   ✅ VZO member: {response.get('user', {}).get('is_vzo_member', False)}")
            return True
        return False

    def test_dvd_stations(self):
        """Test DVD stations endpoint - MAIN FEATURE TO TEST"""
        success, response = self.run_test(
            "Get DVD Stations (MAIN FEATURE)",
            "GET",
            "dvd-stations",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Found {len(response)} DVD stations")
            
            # Check for the 4 expected stations
            expected_stations = [
                "DVD Kneginec Gornji",
                "DVD Donji Kneginec", 
                "DVD Varaždinbreg",
                "DVD Lužan Biškupečki"
            ]
            
            station_names = [station.get('name', '') for station in response]
            print(f"   📍 Station names found: {station_names}")
            
            # Check if stations have required fields
            for station in response:
                required_fields = ['id', 'name', 'address', 'latitude', 'longitude']
                missing_fields = [field for field in required_fields if field not in station or station[field] is None]
                if missing_fields:
                    print(f"   ⚠️  Station {station.get('name', 'Unknown')} missing fields: {missing_fields}")
                else:
                    print(f"   ✅ Station {station.get('name', 'Unknown')} has all required fields")
                    print(f"      - Address: {station.get('address', 'N/A')}")
                    print(f"      - Coordinates: {station.get('latitude', 'N/A')}, {station.get('longitude', 'N/A')}")
                    if 'established_year' in station:
                        print(f"      - Established: {station.get('established_year', 'N/A')}")
            
            return len(response) >= 4  # Should have at least 4 stations
        
        return success

    def test_vehicles(self):
        """Test vehicles endpoint"""
        success, response = self.run_test(
            "Get Vehicles",
            "GET",
            "vehicles",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Found {len(response)} vehicles")
            
            # Check for demo vehicle VG-1 cisterna
            for vehicle in response:
                print(f"   🚗 Vehicle: {vehicle.get('name', 'Unknown')} - {vehicle.get('type', 'Unknown')}")
                if vehicle.get('name') == 'VG-1' or 'cisterna' in vehicle.get('type', '').lower():
                    print(f"      ✅ Found demo vehicle VG-1 cisterna")
                    print(f"      - License plate: {vehicle.get('license_plate', 'N/A')}")
                    print(f"      - Department: {vehicle.get('department', 'N/A')}")
                    print(f"      - Status: {vehicle.get('status', 'N/A')}")
        
        return success

    def test_equipment(self):
        """Test equipment endpoint"""
        success, response = self.run_test(
            "Get Equipment",
            "GET",
            "equipment",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Found {len(response)} equipment items")
            
            # Check for demo equipment - firefighter helmet
            for equipment in response:
                print(f"   🛡️  Equipment: {equipment.get('name', 'Unknown')} - {equipment.get('type', 'Unknown')}")
                if 'helmet' in equipment.get('name', '').lower() or 'helmet' in equipment.get('type', '').lower():
                    print(f"      ✅ Found demo firefighter helmet")
                    print(f"      - Condition: {equipment.get('condition', 'N/A')}")
                    print(f"      - Department: {equipment.get('department', 'N/A')}")
                    print(f"      - Location: {equipment.get('location', 'N/A')}")
        
        return success

    def test_user_extended_fields(self):
        """Test users endpoint for extended fields (medical data, etc.)"""
        success, response = self.run_test(
            "Get Users with Extended Fields",
            "GET",
            "users",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Found {len(response)} users")
            
            # Check for extended fields in user data
            extended_fields = [
                'phone', 'address', 'date_of_birth',
                'medical_exam_date', 'medical_exam_valid_until', 'medical_restrictions',
                'assigned_equipment', 'certifications'
            ]
            
            users_with_extended_data = 0
            for user in response:
                has_extended_fields = any(field in user and user[field] is not None for field in extended_fields)
                if has_extended_fields:
                    users_with_extended_data += 1
                    print(f"   👤 User {user.get('full_name', 'Unknown')} has extended data:")
                    for field in extended_fields:
                        if field in user and user[field] is not None:
                            print(f"      - {field}: {user[field]}")
            
            print(f"   📊 {users_with_extended_data}/{len(response)} users have extended profile data")
        
        return success

def main():
    print("🚒 Additional Firefighter Community API Tests")
    print("Testing DVD Stations, Vehicles, Equipment & Extended Features")
    print("=" * 70)
    
    tester = AdditionalFirefighterAPITester()
    
    # Test sequence for review request specific features
    tests = [
        ("Login VZO Admin", tester.login_vzo_user),
        ("DVD Stations (MAIN FEATURE)", tester.test_dvd_stations),
        ("Vehicles Management", tester.test_vehicles),
        ("Equipment Management", tester.test_equipment),
        ("Extended User Fields", tester.test_user_extended_fields),
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
    print("\n" + "=" * 70)
    print("📊 ADDITIONAL TEST RESULTS")
    print("=" * 70)
    print(f"Total Tests: {tester.tests_run}")
    print(f"Passed: {tester.tests_passed}")
    print(f"Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed Tests:")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print(f"\n✅ All additional tests passed!")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())