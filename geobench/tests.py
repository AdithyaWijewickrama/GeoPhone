import base64
import json
from django.contrib.auth.models import User
from django.test import TestCase, Client
from django.urls import reverse
from .models import Location, KnownEvent, FileBatch, AnomalyLabel, UserProfile


class GeoBenchApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="password123",
            first_name="Test",
            last_name="User"
        )
        self.loc1 = Location.objects.create(
            name="Seismic Site Alpha",
            latitude=37.7749,
            longitude=-122.4194,
            description="San Francisco station",
            user=self.user
        )
        self.loc2 = Location.objects.create(
            name="Seismic Site Beta",
            latitude=34.0522,
            longitude=-118.2437,
            description="Los Angeles station"
        )

    def test_auth_signup_and_login(self):
        # Test Signup
        signup_payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'securepassword',
            'first_name': 'New',
            'last_name': 'User'
        }
        res = self.client.post(
            reverse('auth_signup'),
            data=json.dumps(signup_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['user']['username'], 'newuser')
        self.assertTrue(User.objects.filter(username='newuser').exists())

        # Test Duplicate Signup
        res_dup = self.client.post(
            reverse('auth_signup'),
            data=json.dumps(signup_payload),
            content_type='application/json'
        )
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn('error', res_dup.json())

        # Test Logout
        res_logout = self.client.post(reverse('auth_logout'))
        self.assertEqual(res_logout.status_code, 200)

        # Test Login with Username
        login_payload = {
            'username': 'newuser',
            'password': 'securepassword'
        }
        res_login = self.client.post(
            reverse('auth_login'),
            data=json.dumps(login_payload),
            content_type='application/json'
        )
        self.assertEqual(res_login.status_code, 200)
        self.assertEqual(res_login.json()['user']['email'], 'newuser@example.com')

        # Test auth_me
        res_me = self.client.get(reverse('auth_me'))
        self.assertEqual(res_me.status_code, 200)
        self.assertTrue(res_me.json()['authenticated'])
        self.assertEqual(res_me.json()['user']['username'], 'newuser')

        # Test Login with Email
        self.client.post(reverse('auth_logout'))
        res_email_login = self.client.post(
            reverse('auth_login'),
            data=json.dumps({'username': 'newuser@example.com', 'password': 'securepassword'}),
            content_type='application/json'
        )
        self.assertEqual(res_email_login.status_code, 200)

    def test_auth_google(self):
        # Create a mock Google JWT payload
        google_payload_data = {
            'sub': '123456789012345678901',
            'email': 'googleuser@gmail.com',
            'name': 'Google User',
            'given_name': 'Google',
            'family_name': 'User',
            'picture': 'https://example.com/photo.jpg'
        }
        encoded_payload = base64.urlsafe_b64encode(json.dumps(google_payload_data).encode()).decode().rstrip('=')
        mock_jwt = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{encoded_payload}.signature"

        res = self.client.post(
            reverse('auth_google'),
            data=json.dumps({'credential': mock_jwt}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['user']['email'], 'googleuser@gmail.com')
        self.assertTrue(data['user']['is_google'])
        self.assertEqual(data['user']['avatar_url'], 'https://example.com/photo.jpg')

        # Check existing user login with Google
        res_again = self.client.post(
            reverse('auth_google'),
            data=json.dumps({'credential': mock_jwt}),
            content_type='application/json'
        )
        self.assertEqual(res_again.status_code, 200)
        self.assertEqual(res_again.json()['user']['email'], 'googleuser@gmail.com')

    def test_location_crud_with_user(self):
        # List locations
        res = self.client.get(reverse('locations'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        names = [d['name'] for d in data]
        self.assertIn("Seismic Site Alpha", names)

        # Check user_id in location
        loc1_data = next(d for d in data if d['name'] == 'Seismic Site Alpha')
        self.assertEqual(loc1_data['user_id'], self.user.id)
        self.assertEqual(loc1_data['user_name'], self.user.username)

        # Create new location with user_id
        new_loc_payload = {
            'name': 'Site Gamma',
            'latitude': 40.7128,
            'longitude': -74.0060,
            'description': 'NYC station',
            'user_id': self.user.id
        }
        res = self.client.post(
            reverse('locations'),
            data=json.dumps(new_loc_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')
        self.assertEqual(res.json()['user_id'], self.user.id)
        self.assertTrue(Location.objects.filter(name='Site Gamma', user=self.user).exists())

    def test_known_events_and_collision(self):
        # Create known event with user
        payload = {
            'name': 'Controlled Blast',
            'start_time': 100000.0,
            'end_time': 105000.0,
            'location_id': self.loc1.id,
            'note': 'Scheduled blast',
            'user_id': self.user.id
        }
        res = self.client.post(
            reverse('known_events'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')
        self.assertEqual(res.json()['user_id'], self.user.id)

        # Test collision detection
        collide_payload = {
            'name': 'Overlapping Event',
            'start_time': 102000.0,
            'end_time': 108000.0,
            'location_id': self.loc1.id
        }
        res = self.client.post(
            reverse('known_events'),
            data=json.dumps(collide_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get('status'), 'collision_warning')
        self.assertEqual(len(res.json().get('collisions')), 1)

        # Force save overlapping event
        collide_payload['force'] = True
        res = self.client.post(
            reverse('known_events'),
            data=json.dumps(collide_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')

        # Collision check endpoint
        res = self.client.post(
            reverse('check_event_collision'),
            data=json.dumps({'start_time': 101000.0, 'end_time': 103000.0, 'location_id': self.loc1.id}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['has_collision'])

        # List known events filtered by location
        res = self.client.get(reverse('known_events') + f'?location_id={self.loc1.id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 2)

        res = self.client.get(reverse('known_events') + f'?location_id={self.loc2.id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 0)

    def test_save_label_and_get_labels(self):
        payload = {
            'file': 'geophone_2026-09-24_10-00-00.csv',
            'startTime': 1727172000000.0,
            'endTime': 1727172010000.0,
            'duration': 10.0,
            'peakScore': 8.5,
            'label': 'Vehicle',
            'note': 'Heavy truck',
            'location_id': self.loc1.id,
            'user_id': self.user.id,
            'save_as_known_event': True
        }
        res = self.client.post(
            reverse('save_label'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')
        self.assertEqual(res.json()['user_id'], self.user.id)

        # Check AnomalyLabel was saved with user
        event_id = f"geophone_2026-09-24_10-00-00.csv_{round(payload['startTime'])}_{round(payload['endTime'])}"
        anomaly = AnomalyLabel.objects.filter(id=event_id).first()
        self.assertIsNotNone(anomaly)
        self.assertEqual(anomaly.user, self.user)

        # Check KnownEvent was created with user
        known = KnownEvent.objects.filter(name='Vehicle', location=self.loc1).first()
        self.assertIsNotNone(known)
        self.assertEqual(known.user, self.user)

        # Check get_labels endpoint includes user
        res = self.client.get(reverse('get_labels') + f'?location_id={self.loc1.id}')
        self.assertEqual(res.status_code, 200)
        labels = res.json()
        self.assertEqual(len(labels), 1)
        self.assertEqual(labels[0]['label'], 'Vehicle')
        self.assertEqual(labels[0]['location_name'], 'Seismic Site Alpha')
        self.assertEqual(labels[0]['user_id'], self.user.id)
        self.assertEqual(labels[0]['user_name'], self.user.username)
