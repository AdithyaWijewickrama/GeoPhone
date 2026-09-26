# Python and JavaScript Function Reference

This reference describes named functions and methods in the project's Python files and React frontend JavaScript files. It covers application code and named test helpers/cases. Inline anonymous callbacks are described with their containing function when relevant. Generated files and dependencies such as `.venv`, `node_modules`, and `build` are excluded. This document is descriptive; it does not change program behavior.

## Python

### `manage.py`

- `main()` — Loads Django's command-line settings and dispatches the supplied arguments to Django's management command runner.

### `geophone_project/`

The project configuration modules (`settings.py`, `urls.py`, `asgi.py`, `wsgi.py`) and `__init__.py` files contain no named functions or methods.

### `geobench/models.py`

- `UserProfile` — Stores optional Google identity and avatar details for a Django user.
- `Location` — Represents a named geophone monitoring location and its coordinates.
- `EventLabel` — Stores a user's label and notes for an event interval.
- `FileBatch` — Tracks an uploaded geophone data file and its owner/location.
- `AnomalyLabel` — Stores a label for an anomaly interval belonging to an uploaded file.
- `AnomalyLabel.Meta` — Defines uniqueness of anomaly intervals within each file batch.
- `KnownEvent` — Represents a named event interval used to contextualize triage data.
- `UserProfile.__str__()` — Returns a readable profile label containing the associated username.
- `Location.__str__()` — Returns the location name.
- `EventLabel.__str__()` — Returns the label ID and label text.
- `FileBatch.__str__()` — Returns the uploaded filename.
- `AnomalyLabel.__str__()` — Returns the associated filename and anomaly label type.
- `KnownEvent.__str__()` — Returns the event name and its start/end timestamps.

### `geobench/apps.py`

- `GeobenchConfig` — Configures the GeoBench Django application; it defines no methods of its own.

### `geobench/ml_model.py`

- `parse_filename_datetime(filename)` — Extracts a date/time or epoch timestamp from a filename; returns `None` if it cannot parse one.
- `parse_timestamp_series(series, filename=None)` — Converts a pandas series to datetimes. It recognizes datetime strings and numeric epoch/relative values, using the filename or a 2026 base date for relative times.
- `calculate_robust_z(series)` — Calculates a nonnegative robust deviation score using the median and median absolute deviation.
- `process_geophone_csv(file_obj, filename=None)` — Reads one CSV's timestamp and voltage columns, normalizes timestamps, calculates rolling anomaly features/scores, and returns samples, detected blocks, and timing statistics. Errors are returned as `{ok: False, reason: ...}`.
- `generate_event_plot_from_data(times_input, volts_input, event_start_ms=None, event_end_ms=None)` — Builds a three-panel waveform, event zoom, and spectrogram plot from arrays, returning its PNG as base64 or an error result.
- `generate_event_plot(file_objs, event_start_ms, event_end_ms)` — Reads and combines readable CSV files, sorts their samples, then delegates plotting to `generate_event_plot_from_data()`.
- `process_geophone_chunk(file_objs, filenames)` — Reads multiple CSV files as one timeline, reports unreadable/empty files and time gaps, and calculates anomaly blocks and chunk metadata. Returns a failure result when all files are unusable.

### `geobench/views.py`

- `serialize_user(user)` — Builds the user object returned to the frontend, including profile, display-name, and Google account details where available.
- `decode_jwt_payload(token_str)` — Decodes the payload portion of a JWT for reading claims; it does not validate the token signature.
- `get_request_user(request, data=None)` — Resolves the current Django session user or a user identified by request data/token information.
- `auth_signup(request)` — Handles account registration, validates input, creates the Django user, and returns an authentication response.
- `auth_login(request)` — Authenticates credentials, establishes a Django session, and returns user details or an error.
- `auth_logout(request)` — Ends the current Django session and returns a logout status.
- `auth_me(request)` — Reports whether the request has an authenticated user and returns the user's serialized details.
- `auth_google(request)` — Accepts Google identity information, finds or creates the matching local account/profile, and establishes a session.
- `handle_locations(request)` — Lists locations for GET requests and creates or updates a location for POST requests.
- `process_file_api(request)` — Accepts one uploaded CSV and returns the result of `process_geophone_csv()`.
- `save_label(request)` — Creates, updates, or clears an anomaly label; can also save the labeled interval as a known event.
- `get_labels_api(request)` — Returns saved anomaly labels, optionally filtered by location and user.
- `get_event_plot(request)` — Accepts raw waveform arrays or uploaded files and returns a generated event plot.
- `process_chunk_api(request)` — Registers uploaded file batches, processes the files as one chunk, and includes any existing labels in the response.
- `handle_known_events(request)` — Lists, creates, updates, or deletes known events according to the HTTP method and request action.
- `_create_known_event(request, data)` — Validates and creates a known event, returning an overlap warning unless the request forces creation.
- `_update_known_event(request, event_id, data)` — Updates a known event, checking for overlaps with other events unless forced.
- `handle_known_event_detail(request, event_id)` — Reads, updates, or deletes one known event addressed by ID.
- `check_event_collision(request)` — Finds known events whose time intervals overlap a supplied interval, optionally filtering by location or excluding an event ID.

### `geobench/tests.py`

`GeoBenchApiTests` contains API integration test methods:

- `GeoBenchApiTests` — Integration test class covering GeoBench authentication, location, event, and labeling APIs.

- `setUp()` — Creates the shared authenticated test client and initial test data.
- `test_auth_signup_and_login()` — Checks account signup and credential login behavior.
- `test_auth_google()` — Checks Google authentication/account handling.
- `test_location_crud_with_user()` — Checks location creation and retrieval for a user.
- `test_known_events_and_collision()` — Checks known-event operations and overlap detection.
- `test_save_label_and_get_labels()` — Checks saving and retrieving anomaly labels.
- `test_timestamp_processing_year_2026()` — Checks timestamp parsing behavior for the year 2026.

### `geobench/migrations/`

Each numbered migration module declares a Django `Migration` class and declarative schema operations. The migrations define no named Python methods. `__init__.py` is empty.

## JavaScript

The entries below cover frontend source files in `geobench-frontend/src`, including named test helpers and test cases. Component functions render UI; handlers listed beneath them implement their associated user actions or calculations.

### Application and shared utilities

#### `App.js`

- `AppContent()` — Owns the application shell, navigation, route layout, selected location, and authentication-aware UI.
- `handleSelectLocation(loc)` — Updates the current location and persists the selection.
- `handleLocationCreated(newLoc)` — Adds/selects a newly created location and advances the location flow.
- `handleLogout()` — Logs the user out and navigates to the public entry page.
- `handleNavbarGoogleSuccess()` — Completes navbar Google sign-in navigation, returning to the saved route or triage page.
- `handleNavbarGoogleError(err)` — Logs a navbar Google sign-in error.
- `App()` — Wraps the application in its routing, authentication, theme, and Google identity providers.

#### `utils.js`

- `mergeEvents(blocks, threshold)` — Filters scored blocks by threshold and combines adjacent qualifying blocks into event intervals with peak scores.
- `formatTime(ms)` — Formats a time value as a clock time, interpreting large numeric values as epoch milliseconds.
- `formatDateTime(ms)` — Formats a value as a date and time, applying the module's fallback handling for implausibly early years.
- `toDatetimeLocalString(dateOrMs)` — Converts a date or numeric/string timestamp into the local `datetime-local` input format.
- `parseFilenameDate(filename)` — Parses a date/time or epoch timestamp embedded in a filename, returning a `Date` or `null`.
- `getFileDateMs(file)` — Gets a file's timestamp from its name, falling back to its `lastModified` value.
- `formatDuration(ms)` — Formats a duration in milliseconds as milliseconds, seconds, or minutes and seconds.
- `pad(x, n)` (local helper in `formatTime` and `formatDateTime`) — Zero-pads date/time number components to the requested width.
- `pad(n)` (local helper in `toDatetimeLocalString`) — Zero-pads date/time number components to two digits.

#### `reportWebVitals.js`

- `reportWebVitals(onPerfEntry)` — Loads the web-vitals module on demand and passes its metrics to the supplied callback when one is provided.

#### `index.js`, `setupTests.js`

These files initialize the React root and test environment respectively; they declare no named functions.

### Authentication and appearance context

#### `context/AuthContext.js`

- `AuthProvider({ children })` — Provides authentication state and login, signup, Google login, and logout actions; it restores/checks the current session when mounted.
- `login(username, password)` — Sends credentials to the backend, updates the stored user on success, and reports failure.
- `signup({ username, email, password, first_name, last_name })` — Sends registration data and updates authentication state from the backend response.
- `loginWithGoogle(googleData)` — Exchanges Google identity data with the backend and updates the signed-in user.
- `logout()` — Ends the backend session and clears local user state/storage.
- `useAuth()` — Returns the authentication context and throws when used outside `AuthProvider`.

#### `context/ThemeContext.js`

- `ThemeProvider({ children })` — Loads and applies the saved theme and provides theme selection state/actions to descendants.
- `useTheme()` — Returns the theme context.

### Components

#### `components/GoogleAuthButton.js`

- `GoogleAuthButton(props)` — Renders the Google sign-in control and development fallback where enabled.
- `handleGoogleResponse(response)` — Converts a Google identity response to local login data and calls the success/error callbacks.
- `initGis()` — Initializes Google's identity button when the Google Identity Services API and button element are ready.
- `openDevFallback(errorMsg)` — Opens the development-only manual sign-in fallback and can display an error.
- `handleCustomGoogleClick()` — Starts Google OAuth popup/token flow, retrieves user information, and submits it for local authentication.
- `handleDevSubmit(event)` — Submits development fallback credentials.

#### `components/LocationModal.js`

- `LocationModal(props)` — Displays available locations and the create/select location interface.
- `handleCreateLocation(event)` — Validates and submits a new location, then updates parent state or reports an error.
- `handleSelect(loc)` — Selects a location and invokes the optional continuation callback.

#### `components/ProtectedRoute.js`

- `ProtectedRoute({ children })` — Shows a loading state, renders protected content for authenticated users, or redirects to login.

#### `components/ThemeSelector.js`

- `ThemeSelector()` — Renders the theme picker and closes its menu when a click occurs outside it.
- `handleClickOutside(event)` — Detects clicks outside the theme menu and closes it.

### Triage components

#### `components/triage/ChunkDetail.js`

- `ChunkDetail(props)` — Displays analysis for a selected chunk, including its waveform and detected events.
- `handleWaveformSelectionChange(selection)` — Updates the selected/zoomed waveform interval.
- `getSelectedEventsBounds()` — Returns the combined time bounds and event list for selected table events.
- `handleViewPlot(target)` — Requests an event plot from the backend and displays the result or error.
- `handleBatchSaveFromModal({ finalLabel, note, saveAsKnown, bounds })` — Applies a label/note to selected events and optionally saves the interval as a known event.
- `handleGlobalMouseUp()` (effect-local handler) — Ends a drag selection when the pointer is released anywhere on the page.

#### `components/triage/ChunksList.js`

- `ChunksList(props)` — Displays processed chunks and their selection state.
- `handleChunkMouseDown(chunkKey, idx, event)` — Starts or toggles chunk selection, including shift-selection behavior.
- `handleChunkMouseEnter(idx)` — Extends an active drag selection across chunks.

#### `components/triage/DefineEventModal.js`

- `DefineEventModal(props)` — Provides a form to create or edit a known event, including location and collision handling.
- `handleStartChange(event)` — Updates the event start time and synchronizes its end or duration.
- `handleEndChange(event)` — Updates the end time and recalculates duration.
- `handleDurationChange(event)` — Updates duration and derives the end time from the start.
- `handleSaveEvent(overrideForce)` — Validates and submits a new or edited known event; can retry after a collision warning.
- `handleDelete()` — Confirms and deletes the event currently being edited.
- `handleCloseModal()` — Closes the modal and resets its related state.

#### `components/triage/FlaggedEventsTable.js`

- `FlaggedEventsTable(props)` — Displays detected events and their labels, with table selection and plot actions.
- `handleTableMouseDown(idx, event)` — Starts/toggles event selection and supports shift-selection.
- `handleTableMouseEnter(idx)` — Extends an active drag selection across event rows.
- `handleSelectAll()` — Selects all displayed events or clears the current selection.
- `handleViewPlotSelected()` — Requests a plot covering the selected events, or the full event range when none are selected.

#### `components/triage/KnownEventsList.js`

- `KnownEventsList(props)` — Filters and displays known events with their coverage over the loaded files.
- `getCoverageInfo(event)` — Counts files whose timestamps fall within a known event's time range, with the component's one-minute margin.

#### `components/triage/LabelEventModal.js`

- `LabelEventModal(props)` — Lets the user choose or enter a label and note for selected events and displays collision information.
- `handleSave()` — Validates the chosen label and passes the final label/note to the parent callback.

#### `components/triage/RawFilesList.js`

- `RawFilesList(props)` — Displays uploaded files grouped by date/hour/minute and manages time-based file selection.
- `getEventsInRange(startMs, endMs)` — Finds known events overlapping the supplied interval.
- `handleSelectRawRange(count)` — Selects a requested number of raw files.
- `handleDayClick(dayObj)` — Activates a day and selects an initial available hour/minute group.
- `handleHourClick(hourObj, event)` — Activates an hour and selects its first available minute group.
- `handleSelectHourFiles(hourObj, event)` — Selects or clears every file in an hour group.
- `handleMinuteClick(minObj, event)` — Activates a minute group and updates selection according to click modifiers.
- `handleSelectDayFiles(dayObj, event)` — Selects or clears every file belonging to a day.
- `handleRawMouseDown(idx, event)` — Starts or toggles raw-file selection and tracks drag selection direction.
- `handleRawMouseEnter(idx)` — Extends the active drag selection across raw-file rows.

#### `components/triage/SpectrogramModal.js`

- `SpectrogramModal(props)` — Displays an event plot/spectrogram in a modal.
- `handleDownload()` — Downloads the displayed plot image.

#### `components/triage/TriageHeader.js`

- `TriageHeader(props)` — Renders the triage page heading and its supplied controls/status.

#### `components/triage/WaveformChart.js`

- `WaveformChart(props)` — Renders the waveform chart, event markers, zoom controls, and drag-selection behavior.
- `handleZoomIn()` — Narrows the visible time range around its midpoint.
- `handleZoomOut()` — Widens the visible time range around its midpoint.
- `handleSelectPreset(seconds)` — Sets a preset visible time span around the chart midpoint.
- `handlePan(fraction)` — Shifts the visible range by a fraction of its current duration.
- `handleMouseDown(event)` — Starts waveform drag selection.
- `handleMouseMove(event)` — Updates the active drag-selection endpoint.
- `handleMouseUp(event)` — Converts a sufficiently large chart drag into a selected time range.
- `handleResetZoom()` — Restores the chart's full time range.
- `handleWheel(event)` (effect-local handler) — Zooms around the pointer in response to the mouse wheel.
- `handleTriggerViewPlot()` — Invokes the supplied plot-view callback for the relevant event interval.

#### `components/triage/constants.js`

Exports label options, the default anomaly threshold, and API base URL constants; it declares no functions.

### Pages

#### `pages/Documentation.js`

- `Documentation()` — Renders the in-app usage documentation.
- `toggleSection(section)` — Expands or collapses the selected documentation section.

#### `pages/Forecasting.js`

- `Forecasting()` — Renders the forecasting page interface.

#### `pages/LabeledData.js`

- `LabeledData(props)` — Fetches and displays saved labels, with location and user filtering.
- `fetchLabels()` — Requests saved labels using the current location/filter parameters.

#### `pages/Login.js`

- `Login()` — Renders the login page and redirects after a successful sign-in.
- `handleLogin(event)` — Validates/submits login form data and reports authentication errors.

#### `pages/Signup.js`

- `Signup()` — Renders the registration page and redirects after successful account creation.
- `handleChange(event)` — Updates the matching signup form field.
- `handleSignup(event)` — Validates signup fields and submits registration data.

#### `pages/TriageDashboard.js`

- `TriageDashboard(props)` — Coordinates raw file selection, chunk scanning, event labeling, known events, and triage display state.
- `handleGlobalMouseUp()` (effect-local handler) — Ends an active mouse drag selection.
- `fetchKnownEvents()` — Loads known events, filtered to the active location where applicable.
- `handleFilesSelected(event)` — Filters selected files to CSV, sorts them by inferred timestamp, and initializes raw-file state.
- `handleOpenDefineModal(event)` — Opens the known-event form for creation or editing.
- `handleCloseDefineModal()` — Closes and resets the known-event form.
- `handleDeleteKnownEvent(event)` — Deletes a known event and refreshes related state.
- `scanFilesAsChunk(filesToScan, customName)` — Uploads selected files for chunk analysis and maps returned data/labels into dashboard state.
- `runFullScan()` — Scans the complete loaded raw-file set as one chunk.
- `getRawSelectionInfo()` — Summarizes currently selected files, including count, time range, and duration.
- `handleAnalyzeRawSelection()` — Scans only the currently selected raw files.
- `handleSelectKnownEvent(event)` — Selects files around a known event's time interval and scans them.
- `handleSaveLabel(chunkKey, chunkName, event, label, note, saveAsKnownEvent)` — Saves or clears an event label and optionally creates a known event.
- `handleClearAll()` — Clears loaded/scanned chunk and selection state.
- `handleEventCreated()` — Refreshes known events after creation or editing.

### JavaScript tests

#### `App.test.js`

- Test cases verify application rendering and key route/navigation behavior; no named helper functions are declared.

#### `GoogleAuthButton.test.js`

- `renderWithProviders(ui)` — Renders the supplied UI inside the providers required by authentication components.
- Test cases verify Google sign-in button behavior.

#### `ProtectedRoute.test.js`

- `renderWithAuth(ui, authValue, initialEntries)` — Renders UI inside a router and mocked authentication context.
- Test cases verify protected-route loading, authenticated access, and unauthenticated redirects.

#### `Theme.test.js`

- `TestConsumer()` (declared within test cases) — Reads and renders theme context values so the tests can verify provider behavior.
- Test cases verify theme initialization and updates.

#### `TriageDashboard.test.js`

- `renderWithProviders(ui)` — Renders the supplied UI inside router, authentication, and theme providers for dashboard tests.
- Test cases verify dashboard interactions using mocked API responses.
