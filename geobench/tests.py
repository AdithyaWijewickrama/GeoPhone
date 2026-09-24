import json
from django.test import TestCase, Client
from django.urls import reverse
from .models import Location, KnownEvent, FileBatch, AnomalyLabel


class GeoBenchApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.loc1 = Location.objects.create(
            name="Seismic Site Alpha",
            latitude=37.7749,
            longitude=-122.4194,
            description="San Francisco station"
        )
        self.loc2 = Location.objects.create(
            name="Seismic Site Beta",
            latitude=34.0522,
            longitude=-118.2437,
            description="Los Angeles station"
        )

    def test_location_crud(self):
        # List locations
        res = self.client.get(reverse('locations'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        names = [d['name'] for d in data]
        self.assertIn("Seismic Site Alpha", names)

        # Create new location
        new_loc_payload = {
            'name': 'Site Gamma',
            'latitude': 40.7128,
            'longitude': -74.0060,
            'description': 'NYC station'
        }
        res = self.client.post(
            reverse('locations'),
            data=json.dumps(new_loc_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')
        self.assertTrue(Location.objects.filter(name='Site Gamma').exists())

    def test_known_events_and_collision(self):
        # Create known event
        payload = {
            'name': 'Controlled Blast',
            'start_time': 100000.0,
            'end_time': 105000.0,
            'location_id': self.loc1.id,
            'note': 'Scheduled blast'
        }
        res = self.client.post(
            reverse('known_events'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')

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
            'save_as_known_event': True
        }
        res = self.client.post(
            reverse('save_label'),
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')

        # Check AnomalyLabel was saved
        event_id = f"geophone_2026-09-24_10-00-00.csv_{round(payload['startTime'])}_{round(payload['endTime'])}"
        self.assertTrue(AnomalyLabel.objects.filter(id=event_id).exists())

        # Check KnownEvent was created
        self.assertTrue(KnownEvent.objects.filter(name='Vehicle', location=self.loc1).exists())

        # Check get_labels endpoint
        res = self.client.get(reverse('get_labels') + f'?location_id={self.loc1.id}')
        self.assertEqual(res.status_code, 200)
        labels = res.json()
        self.assertEqual(len(labels), 1)
        self.assertEqual(labels[0]['label'], 'Vehicle')
        self.assertEqual(labels[0]['location_name'], 'Seismic Site Alpha')
