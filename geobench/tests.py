import base64
import json
from django.contrib.auth.models import User
from django.test import TestCase, Client
from django.urls import reverse
from .models import Location, KnownEvent, FileBatch, AnomalyLabel, UserProfile


class GeoBenchApiTests(TestCase):
    """Integration tests for GeoBench authentication, location, event, and labeling APIs."""

    def setUp(self):
        """Creates the shared authenticated test client and initial test data."""
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
        """Checks account signup and credential login behavior."""
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
        """Checks Google authentication/account handling."""
        # Create a mock Google JWT payload with name "Demo user google"
        google_payload_data = {
            'sub': '123456789012345678901',
            'email': 'demo.user.google@gmail.com',
            'name': 'Demo user google',
            'given_name': 'Demo',
            'family_name': 'user google',
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
        self.assertEqual(data['user']['email'], 'demo.user.google@gmail.com')
        self.assertEqual(data['user']['display_name'], 'Demo user google')
        self.assertEqual(data['user']['first_name'], 'Demo')
        self.assertEqual(data['user']['last_name'], 'user google')
        self.assertTrue(data['user']['is_google'])
        self.assertEqual(data['user']['avatar_url'], 'https://example.com/photo.jpg')

        # Check existing user login with Google updates names properly
        res_again = self.client.post(
            reverse('auth_google'),
            data=json.dumps({'credential': mock_jwt}),
            content_type='application/json'
        )
        self.assertEqual(res_again.status_code, 200)
        self.assertEqual(res_again.json()['user']['display_name'], 'Demo user google')

    def test_location_crud_with_user(self):
        """Checks location creation and retrieval for a user."""
        # List locations (all available locations returned regardless of user query)
        res = self.client.get(reverse('locations'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        names = [d['name'] for d in data]
        self.assertIn("Seismic Site Alpha", names)
        self.assertIn("Seismic Site Beta", names)

        # Check with user_id param - all available locations still returned for popups
        res_with_user = self.client.get(reverse('locations') + f'?user_id={self.user.id}')
        self.assertEqual(res_with_user.status_code, 200)
        self.assertEqual(len(res_with_user.json()), 2)

        # Check user_id in location
        loc1_data = next(d for d in data if d['name'] == 'Seismic Site Alpha')
        self.assertEqual(loc1_data['user_id'], self.user.id)
        self.assertEqual(loc1_data['user_name'], self.user.username)

        # Check unassigned location user_name is None
        loc2_data = next(d for d in data if d['name'] == 'Seismic Site Beta')
        self.assertIsNone(loc2_data['user_id'])
        self.assertIsNone(loc2_data['user_name'])

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
        """Checks known-event operations and overlap detection."""
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
        event_1_id = res.json()[0]['id']

        res = self.client.get(reverse('known_events') + f'?location_id={self.loc2.id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 0)

        # Test GET single known event
        res = self.client.get(reverse('known_event_detail', kwargs={'event_id': event_1_id}))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['id'], event_1_id)

        # Test Edit / PUT known event with collision warning
        edit_payload = {
            'name': 'Updated Blast Event',
            'start_time': 100050.0,
            'end_time': 104950.0,
            'location_id': self.loc1.id,
            'note': 'Blast timing updated'
        }
        res_warn = self.client.put(
            reverse('known_event_detail', kwargs={'event_id': event_1_id}),
            data=json.dumps(edit_payload),
            content_type='application/json'
        )
        self.assertEqual(res_warn.status_code, 200)
        self.assertEqual(res_warn.json().get('status'), 'collision_warning')

        # Edit / PUT with force=True
        edit_payload['force'] = True
        res = self.client.put(
            reverse('known_event_detail', kwargs={'event_id': event_1_id}),
            data=json.dumps(edit_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'Updated Blast Event')
        self.assertEqual(res.json()['note'], 'Blast timing updated')

        # Test Edit via POST to handle_known_events
        res = self.client.post(
            reverse('known_events'),
            data=json.dumps({
                'id': event_1_id,
                'name': 'Renamed Blast Event',
                'start_time': 100050.0,
                'end_time': 104950.0,
                'location_id': self.loc1.id,
                'note': 'Renamed',
                'force': True
            }),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'Renamed Blast Event')

        # Test DELETE known event detail
        res = self.client.delete(reverse('known_event_detail', kwargs={'event_id': event_1_id}))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'deleted')
        self.assertFalse(KnownEvent.objects.filter(id=event_1_id).exists())

        # Test DELETE via query param on handle_known_events
        events_left = self.client.get(reverse('known_events')).json()
        self.assertEqual(len(events_left), 1)
        other_event_id = events_left[0]['id']
        res = self.client.delete(reverse('known_events') + f'?id={other_event_id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'deleted')
        self.assertFalse(KnownEvent.objects.filter(id=other_event_id).exists())

    def test_save_label_and_get_labels(self):
        """Checks saving and retrieving anomaly labels."""
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

    def test_timestamp_processing_year_2026(self):
        """Checks timestamp parsing behavior for the year 2026."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .ml_model import process_geophone_csv, process_geophone_chunk, generate_event_plot
        import pandas as pd

        # 1. Test relative seconds with timestamped filename (e.g. 2026-07-29_21-58-26.csv)
        csv_relative = "timestamp,voltage\n0.0,0.5\n0.01,0.6\n0.02,0.4\n"
        f1 = SimpleUploadedFile("2026-07-29_21-58-26.csv", csv_relative.encode('utf-8'), content_type="text/csv")
        res1 = process_geophone_csv(f1, filename="2026-07-29_21-58-26.csv")
        self.assertTrue(res1['ok'])
        dt1 = pd.to_datetime(res1['startTime'], unit='ms')
        self.assertEqual(dt1.year, 2026)
        self.assertEqual(dt1.month, 7)
        self.assertEqual(dt1.day, 29)

        # 2. Test epoch seconds (e.g. 1787600000 which is in 2026)
        csv_epoch_s = "timestamp,voltage\n1787600000,0.5\n1787600001,0.6\n"
        f2 = SimpleUploadedFile("data_epoch_s.csv", csv_epoch_s.encode('utf-8'), content_type="text/csv")
        res2 = process_geophone_csv(f2)
        self.assertTrue(res2['ok'])
        dt2 = pd.to_datetime(res2['startTime'], unit='ms')
        self.assertGreaterEqual(dt2.year, 2026)

        # 3. Test epoch milliseconds (e.g. 1787600000000)
        csv_epoch_ms = "timestamp,voltage\n1787600000000,0.5\n1787600001000,0.6\n"
        f3 = SimpleUploadedFile("data_epoch_ms.csv", csv_epoch_ms.encode('utf-8'), content_type="text/csv")
        res3 = process_geophone_csv(f3)
        self.assertTrue(res3['ok'])
        dt3 = pd.to_datetime(res3['startTime'], unit='ms')
        self.assertGreaterEqual(dt3.year, 2026)

        # 4. Test chunk processing with 2026 filenames
        f_chunk1 = SimpleUploadedFile("2026-09-24_10-00-00.csv", csv_relative.encode('utf-8'), content_type="text/csv")
        f_chunk2 = SimpleUploadedFile("2026-09-24_10-01-00.csv", csv_relative.encode('utf-8'), content_type="text/csv")
        chunk_res = process_geophone_chunk([f_chunk1, f_chunk2], ["2026-09-24_10-00-00.csv", "2026-09-24_10-01-00.csv"])
        self.assertTrue(chunk_res['ok'])
        chunk_dt = pd.to_datetime(chunk_res['startTime'], unit='ms')
        self.assertEqual(chunk_dt.year, 2026)

        # 5. Test plot generation
        f_plot = SimpleUploadedFile("2026-09-24_10-00-00.csv", csv_relative.encode('utf-8'), content_type="text/csv")
        plot_res = generate_event_plot([f_plot], chunk_res['startTime'], chunk_res['endTime'])
        self.assertTrue(plot_res['ok'])
        self.assertIn('image', plot_res)

        # 6. Test plot endpoints with JSON times/volts data
        json_plot_res = self.client.post(
            reverse('get_event_plot'),
            data=json.dumps({
                'times': chunk_res['times'],
                'volts': chunk_res['volts'],
                'start_time': chunk_res['startTime'],
                'end_time': chunk_res['endTime']
            }),
            content_type='application/json'
        )
        self.assertEqual(json_plot_res.status_code, 200)
        self.assertTrue(json_plot_res.json().get('ok'))
        self.assertIn('image', json_plot_res.json())

        # Test plot_event alias
        plot_event_res = self.client.post(
            reverse('plot_event'),
            data=json.dumps({
                'times': chunk_res['times'],
                'volts': chunk_res['volts'],
                'event_start': chunk_res['startTime'],
                'event_end': chunk_res['endTime']
            }),
            content_type='application/json'
        )
        self.assertEqual(plot_event_res.status_code, 200)
        self.assertTrue(plot_event_res.json().get('ok'))
