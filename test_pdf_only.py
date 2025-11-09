import requests
import sys
import json
from datetime import datetime

class PDFTester:
    def __init__(self, base_url="https://emergencypwa.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0

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

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    if 'application/pdf' in response.headers.get('Content-Type', ''):
                        print(f"   PDF Size: {len(response.content)} bytes")
                        return True, {}
                    else:
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

    def login_test_user(self):
        """Login with test user"""
        login_data = {
            "username": "test_zapovjednik_final",
            "password": "password123"
        }
        
        success, response = self.run_test(
            "Login Test User",
            "POST",
            "login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   ✅ Logged in successfully")
            return True
        return False

    def test_pdf_evidencijski_list_dvd(self):
        """Test PDF generation for evidencijski list - DVD department"""
        success, response = self.run_test(
            "Generate Evidencijski List PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/evidencijski-list/DVD_Kneginec_Gornji",
            200
        )
        return success

    def test_pdf_evidencijski_list_vzo(self):
        """Test PDF generation for evidencijski list - VZO (all members)"""
        success, response = self.run_test(
            "Generate Evidencijski List PDF (VZO - All Members)",
            "GET",
            "pdf/evidencijski-list/VZO",
            200
        )
        return success

    def test_pdf_oprema_vozilo_dvd(self):
        """Test PDF generation for vehicle equipment - DVD department"""
        success, response = self.run_test(
            "Generate Vehicle Equipment PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/oprema-vozilo/DVD_Kneginec_Gornji",
            200
        )
        return success

    def test_pdf_oprema_vozilo_vzo(self):
        """Test PDF generation for vehicle equipment - VZO (all vehicles)"""
        success, response = self.run_test(
            "Generate Vehicle Equipment PDF (VZO - All Vehicles)",
            "GET",
            "pdf/oprema-vozilo/VZO",
            200
        )
        return success

    def test_pdf_oprema_spremiste_dvd(self):
        """Test PDF generation for storage equipment - DVD department"""
        success, response = self.run_test(
            "Generate Storage Equipment PDF (DVD_Kneginec_Gornji)",
            "GET",
            "pdf/oprema-spremiste/DVD_Kneginec_Gornji",
            200
        )
        return success

    def test_pdf_osobno_zaduzenje(self):
        """Test PDF generation for personal equipment assignment"""
        # First, get users to find a test user
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
        return success

def main():
    print("🚒 Testing PDF Generation Endpoints")
    print("=" * 50)
    
    tester = PDFTester()
    
    # Login first
    if not tester.login_test_user():
        print("❌ Failed to login, cannot test PDF endpoints")
        return 1
    
    # PDF Tests
    tests = [
        ("PDF Evidencijski List (DVD)", tester.test_pdf_evidencijski_list_dvd),
        ("PDF Evidencijski List (VZO)", tester.test_pdf_evidencijski_list_vzo),
        ("PDF Vehicle Equipment (DVD)", tester.test_pdf_oprema_vozilo_dvd),
        ("PDF Vehicle Equipment (VZO)", tester.test_pdf_oprema_vozilo_vzo),
        ("PDF Storage Equipment (DVD)", tester.test_pdf_oprema_spremiste_dvd),
        ("PDF Personal Assignment", tester.test_pdf_osobno_zaduzenje),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 PDF TEST RESULTS")
    print("=" * 50)
    print(f"Total Tests: {tester.tests_run}")
    print(f"Passed: {tester.tests_passed}")
    print(f"Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed Tests:")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print(f"\n✅ All PDF tests passed!")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())