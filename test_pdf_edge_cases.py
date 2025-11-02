import requests
import sys
import json
from datetime import datetime

class PDFEdgeCaseTester:
    def __init__(self, base_url="https://responderapp.preview.emergentagent.com"):
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
        print(f"   Expected Status: {expected_status}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)

            print(f"   Actual Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED")
                
                # Check headers for PDF responses
                if expected_status == 200 and 'pdf' in endpoint:
                    content_type = response.headers.get('Content-Type', '')
                    content_disposition = response.headers.get('Content-Disposition', '')
                    print(f"   Content-Type: {content_type}")
                    print(f"   Content-Disposition: {content_disposition}")
                    print(f"   PDF Size: {len(response.content)} bytes")
                    
                    # Verify it's actually a PDF
                    if 'application/pdf' not in content_type:
                        print(f"   ⚠️  Warning: Content-Type is not application/pdf")
                    if 'attachment' not in content_disposition:
                        print(f"   ⚠️  Warning: Content-Disposition doesn't indicate attachment")
                    if len(response.content) == 0:
                        print(f"   ⚠️  Warning: PDF file is empty")
                
                return True, {}
            else:
                print(f"❌ FAILED")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text[:200]}")
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

    def test_pdf_without_auth(self):
        """Test PDF endpoints without authentication"""
        # Remove token temporarily
        temp_token = self.token
        self.token = None
        
        success = self.run_test(
            "PDF Without Authentication (Should Fail)",
            "GET",
            "pdf/evidencijski-list/DVD_Kneginec_Gornji",
            403  # Should return 403 Forbidden
        )
        
        # Restore token
        self.token = temp_token
        return success

    def test_pdf_invalid_department(self):
        """Test PDF with invalid department"""
        return self.run_test(
            "PDF with Invalid Department",
            "GET",
            "pdf/evidencijski-list/INVALID_DEPARTMENT_12345",
            200  # Should still return 200 but with empty/minimal data
        )

    def test_pdf_invalid_user_id(self):
        """Test personal assignment PDF with invalid user ID"""
        return self.run_test(
            "Personal Assignment PDF with Invalid User ID",
            "GET",
            "pdf/osobno-zaduzenje/invalid-user-id-12345",
            404  # Should return 404 Not Found
        )

    def test_pdf_nonexistent_user_id(self):
        """Test personal assignment PDF with non-existent but valid UUID"""
        return self.run_test(
            "Personal Assignment PDF with Non-existent User ID",
            "GET",
            "pdf/osobno-zaduzenje/12345678-1234-1234-1234-123456789012",
            404  # Should return 404 Not Found
        )

    def test_pdf_headers_and_content(self):
        """Test PDF response headers and content validation"""
        url = f"{self.api_url}/pdf/evidencijski-list/DVD_Kneginec_Gornji"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            self.tests_run += 1
            print(f"\n🔍 Testing PDF Headers and Content Validation...")
            
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                content_disposition = response.headers.get('Content-Disposition', '')
                content_length = len(response.content)
                
                print(f"   Content-Type: {content_type}")
                print(f"   Content-Disposition: {content_disposition}")
                print(f"   Content Length: {content_length} bytes")
                
                # Validate PDF content
                pdf_valid = True
                issues = []
                
                if 'application/pdf' not in content_type:
                    pdf_valid = False
                    issues.append("Content-Type is not application/pdf")
                
                if 'attachment' not in content_disposition:
                    pdf_valid = False
                    issues.append("Content-Disposition doesn't indicate attachment")
                
                if 'filename=' not in content_disposition:
                    pdf_valid = False
                    issues.append("Content-Disposition doesn't include filename")
                
                if content_length == 0:
                    pdf_valid = False
                    issues.append("PDF file is empty")
                
                # Check if content starts with PDF signature
                if len(response.content) >= 4:
                    pdf_signature = response.content[:4]
                    if pdf_signature != b'%PDF':
                        pdf_valid = False
                        issues.append("Content doesn't start with PDF signature")
                
                if pdf_valid:
                    self.tests_passed += 1
                    print(f"✅ PASSED - PDF headers and content are valid")
                    return True
                else:
                    print(f"❌ FAILED - PDF validation issues:")
                    for issue in issues:
                        print(f"     - {issue}")
                    return False
            else:
                print(f"❌ FAILED - HTTP {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ FAILED - Exception: {str(e)}")
            return False

def main():
    print("🚒 Testing PDF Edge Cases and Validation")
    print("=" * 50)
    
    tester = PDFEdgeCaseTester()
    
    # Login first
    if not tester.login_test_user():
        print("❌ Failed to login, cannot test PDF endpoints")
        return 1
    
    # Edge case tests
    tests = [
        ("PDF Without Authentication", tester.test_pdf_without_auth),
        ("PDF Invalid Department", tester.test_pdf_invalid_department),
        ("PDF Invalid User ID", tester.test_pdf_invalid_user_id),
        ("PDF Non-existent User ID", tester.test_pdf_nonexistent_user_id),
        ("PDF Headers and Content", tester.test_pdf_headers_and_content),
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
    print("📊 PDF EDGE CASE TEST RESULTS")
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
        print(f"\n✅ All edge case tests passed!")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())