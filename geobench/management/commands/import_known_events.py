import csv
from types import SimpleNamespace

from django.core.management.base import BaseCommand, CommandError

from geobench.models import Location
from geobench.views import _create_known_event


class Command(BaseCommand):
    help = 'Import site log rows as known events. Dry-run by default; pass --commit to write.'

    def add_arguments(self, parser):
        parser.add_argument('csv_file')
        parser.add_argument('--commit', action='store_true', help='Create validated known events in the database.')
        parser.add_argument('--location', help='Location name to attach when the CSV has no location column.')

    def handle(self, *args, **options):
        location = Location.objects.filter(name=options['location']).first() if options.get('location') else None
        if options.get('location') and not location:
            raise CommandError(f"Unknown location: {options['location']}")
        count, failures = 0, 0
        try:
            stream = open(options['csv_file'], newline='', encoding='utf-8-sig')
        except OSError as exc:
            raise CommandError(str(exc)) from exc
        with stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames:
                raise CommandError('CSV must include a header row.')
            for line, row in enumerate(reader, start=2):
                values = {str(k).strip().lower().replace(' ', '_').replace('-', '_'): (v or '').strip() for k, v in row.items() if k}
                name = next((values[k] for k in ('name', 'event', 'event_name', 'event_type', 'category', 'label') if values.get(k)), '')
                start = next((values[k] for k in ('start_time', 'start', 'start_datetime', 'datetime', 'date_time', 'date') if values.get(k)), '')
                end = next((values[k] for k in ('end_time', 'end', 'end_datetime') if values.get(k)), '')
                if start and values.get('time') and 'T' not in start and ' ' not in start:
                    start = f"{start} {values['time']}"
                if not end and values.get('duration_seconds'):
                    try:
                        from datetime import datetime
                        start_dt = datetime.fromisoformat(start)
                        from datetime import timedelta
                        end = (start_dt + timedelta(seconds=float(values['duration_seconds']))).isoformat()
                    except ValueError:
                        pass
                if not end and values.get('duration_minutes'):
                    try:
                        from datetime import datetime, timedelta
                        end = (datetime.fromisoformat(start) + timedelta(minutes=float(values['duration_minutes']))).isoformat()
                    except ValueError:
                        pass
                try:
                    if not name or not start or not end:
                        raise ValueError('required name/start/end columns are missing')
                    from datetime import datetime
                    def milliseconds(value):
                        try:
                            return float(value)
                        except ValueError:
                            pass
                        try:
                            return datetime.fromisoformat(value).timestamp() * 1000
                        except ValueError:
                            pass
                        for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
                            try:
                                return datetime.strptime(value, fmt).timestamp() * 1000
                            except ValueError:
                                continue
                        raise ValueError(f'unsupported date/time {value!r}')
                    data = {'name': name, 'start_time': milliseconds(start), 'end_time': milliseconds(end),
                            'note': values.get('note', values.get('notes', ''))}
                    row_location = values.get('location')
                    loc = Location.objects.filter(name=row_location).first() if row_location else location
                    if row_location and loc is None:
                        raise ValueError(f'unknown location {row_location!r}')
                    if loc:
                        data['location_id'] = loc.id
                    if options['commit']:
                        request = SimpleNamespace(user=None, headers={}, GET={}, POST={})
                        response = _create_known_event(request, data)
                        payload = getattr(response, 'content', b'{}')
                        import json
                        parsed = json.loads(payload.decode('utf-8'))
                        if response.status_code >= 400 or parsed.get('status') == 'collision_warning':
                            failures += 1
                            self.stderr.write(f'Line {line}: {parsed}')
                        else:
                            count += 1
                    else:
                        count += 1
                except (TypeError, ValueError, OverflowError) as exc:
                    failures += 1
                    self.stderr.write(f'Line {line}: {exc}')
        verb = 'Imported' if options['commit'] else 'Validated'
        self.stdout.write(f'{verb} {count} event row(s); {failures} failed.')
        if not options['commit']:
            self.stdout.write('Dry-run only. Pass --commit to create events.')
