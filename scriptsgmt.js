let map;
let markersByIndustry = {};
let infoWindow;
let customPopup;
let placesService;
let geocoder;
let zipPolygon;
let markerCounter = 0;
let excelData = [];
let currentBuildingPolygon = null;
let currentBuildingMarker = null; // Track the currently displayed building marker
const progressBar = document.getElementById('progressBar');
const buildingTypes = {
    'Commercial - General': ['office', 'commercial', 'warehouse', 'hotel', 'apartment', 'residential', 'public_building',
        'apartments', 'public', 'hotel', 'commercial;residential', 'sports_centre', 'stadium', 'sports_hall',
        'kitchen', 'government_office', 'bank', 'storage', 'museum', 'sport', 'community_centre',
        'motel', 'library', 'townhall', 'theatre', 'cinema', 'recreation', 'aviary', 'hostel', 'gym',
        'exhibition_hall', 'observatory', 'recreational', 'laboratory', 'arena'],
    'Industrial': ['industrial', 'factory', 'manufacture', 'works', 'warehouse', 'sawmill', 'processing_plant', 'power_substation',
        'utility', 'electricity', 'car_repair', 'power', 'brewery', 'pumping_station', 'industrial;yes', 'transformer',
        'sub_station', 'power_plant', 'yes;industrial', 'power_station', 'industrial␣building'],
    'School': ['school', 'college', 'university', 'kindergarten', 'education', 'academic', 'dormitory', 'educational', 'school;yes',
        'yes;school', 'academic', 'high␣school', 'school;roof', 'preschool', 'school;kindergarten', 'kindergarten;school',
        'School'],
    'Commercial - Retail': ['retail', 'store', 'mall', 'supermarket', 'commercial', 'kiosk', 'shop', 'market', 'shopping'],
    'Commercial - Grocery Store': ['supermarket', 'grocery', 'retail'],
    'Hospital': ['hospital', 'clinic', 'nursing_home', 'healthcare', 'sanatorium', 'social_facility', 'policlinic', 'doctors',
        'medical', 'yes;hospital', 'retirement_home', 'health_care', 'care_home', 'hospital;yes'],
    'Aggregates': ['quarry', 'mining', 'silo', 'gravel'],
    'Waste & Water Treatment': ['waste', 'water_treatment', 'recycling', 'landfill', 'sewage_treatment', 'waste_disposal'],
    'Oil & Gas': ['oil', 'gas', 'refinery', 'petroleum', 'oil_terminal', 'fuel'],
    'Cold Storage': ['cold_storage'],
    'Data Center': ['data_center'],
    'Temperature-Controlled Greenhouse': ['greenhouse', 'conservatory', 'glasshouse', 'greenhouse_horticulture'],
    'Energy Intensive Farm': ['dairy', 'agricultural', 'farm_auxiliary', 'poultry_house', 'livestock', 'agriculture', 'poultry_stable']
};

const markerColors = {
    'Commercial - General': 'pink',
    'Industrial': 'orange',
    'School': 'yellow',
    'Commercial - Retail': 'blue',
    'Commercial - Grocery Store': 'purple',
    'Hospital': 'red',
    'Aggregates': 'green',
    'Waste & Water Treatment': 'brown',
    'Oil & Gas': 'black',
    'Cold Storage': 'cyan',
    'Data Center': 'magenta',
    'Temperature-Controlled Greenhouse': 'lime',
    'Energy Intensive Farm': 'teal'
};

const sqftRequirements = {
    'Commercial - General': 200000,
    'Industrial': 55000,
    'School': 65000,
    'Commercial - Retail': 100000,
    'Commercial - Grocery Store': 60000,
    'Hospital': 60000,
    'Aggregates': 0,
    'Waste & Water Treatment': 0,
    'Oil & Gas': 0,
    'Cold Storage': 0,
    'Data Center': 0,
    'Temperature-Controlled Greenhouse': 0,
    'Energy Intensive Farm': 0
};

// Toggle the upload sidebar
function toggleUploadSidebar() {
    const uploadSidebar = document.getElementById('uploadSidebar');
    uploadSidebar.classList.toggle('open');
}

// Show the documentation modal with PDF preview
function openDocumentationModal() {
    document.getElementById('documentationModal').style.display = "block";
    document.getElementById('pdfViewer').src = "Google Mapping Tool (Program Documentation).pdf";
}

// Close the documentation modal
function closeDocumentationModal() {
    document.getElementById('documentationModal').style.display = 'none';
    document.getElementById('pdfViewer').src = '';
}

// Initialize the upload sidebar
    document.getElementById('fileUpload').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                excelData = XLSX.utils.sheet_to_json(firstSheet);
                processFile();  // Automatically process the file after upload
            };
            reader.readAsArrayBuffer(file);
        }
    });

// Download button listener
document.getElementById('downloadBtn').addEventListener('click', function () {
    const newWorkbook = XLSX.utils.book_new();
    const newSheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Updated Data');
    XLSX.writeFile(newWorkbook, 'updated_square_footage.xlsx');  // Download the processed file
});

// Initialize map
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 40.730610, lng: -73.935242 },
        zoom: 13,
    });

    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();
    infoWindow = new google.maps.InfoWindow();  // Initialize InfoWindow for pop-ups
}

// Draw a red polygon around the building and remove any existing polygon
function drawBuildingPolygon(coords) {
    // Remove the existing polygon
    if (currentBuildingPolygon) {
        currentBuildingPolygon.setMap(null);
    }

    // Convert coordinates to Google Maps LatLng format
    const googleCoords = coords.map(coord => ({ lat: coord[1], lng: coord[0] }));

    // Draw a new polygon
    currentBuildingPolygon = new google.maps.Polygon({
        paths: googleCoords,
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0.35
    });

    // Set the polygon on the map
    currentBuildingPolygon.setMap(map);
}

// Fetch building coordinates using Overpass API
function fetchBuildingCoordinates(lat, lng) {
    return new Promise((resolve, reject) => {
        const overpassQuery = `
            [out:json];
            way["building"](around:50,${lat},${lng});
            out body;
            >;
            out skel qt;
        `;
        const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQuery);

        fetch(overpassUrl)
            .then(response => response.json())
            .then(data => {
                const buildings = data.elements.filter(el => el.type === 'way');
                if (buildings.length > 0) {
                    const coords = getBuildingCoordinates(buildings[0], data);
                    resolve(coords);
                } else {
                    resolve(null);
                }
            })
            .catch(error => {
                console.error('Overpass API error:', error);
                resolve(null);
            });
    });
}

// Fetch and display buildings for a specific address using Overpass
function loadAddressBuilding(location) {
    const lat = location.lat();
    const lng = location.lng();

    fetchOverpassSquareFootage(lat, lng).then(squareFootage => {
        if (squareFootage) {
            // Remove previous marker if exists
            if (currentBuildingMarker) {
                currentBuildingMarker.setMap(null);
            }

            // Create new marker
            currentBuildingMarker = new google.maps.Marker({
                position: location,
                map: map,
                icon: { url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }
            });

            fetchBuildingCoordinates(lat, lng).then(coords => {
                if (coords && coords.length > 0) {
                    drawBuildingPolygon(coords);  // Draw the new polygon
                    showCustomPopup(currentBuildingMarker, 'Specific Building', squareFootage.toFixed(2));

                    // Add a click listener to reopen the popup
                    currentBuildingMarker.addListener('click', () => {
                        showCustomPopup(currentBuildingMarker, 'Specific Building', squareFootage.toFixed(2));
                    });
                } else {
                    alert('No building outline found for this address.');
                }
            });
        } else {
            alert('No building data found for this address.');
        }
    });
}

// Function to handle searching by address
function searchAddress() {
    const address = document.getElementById('addressInput').value;
    clearAllMarkersAndPolygons();  // Clear previous markers and polygons

    geocoder.geocode({ 'address': address }, function (results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
            const location = results[0].geometry.location;
            map.setCenter(location);
            loadAddressBuilding(location);
        } else {
            alert('Geocode was not successful for the following reason: ' + status);
        }
    });
}

// Clear all markers and polygons from the map
function clearAllMarkersAndPolygons() {
    clearAllMarkers();

    // Clear the current building marker
    if (currentBuildingMarker) {
        currentBuildingMarker.setMap(null);
        currentBuildingMarker = null;
    }

    // Clear the current building polygon
    if (currentBuildingPolygon) {
        currentBuildingPolygon.setMap(null);
        currentBuildingPolygon = null;
    }

    // Clear the ZIP polygon
    if (zipPolygon) {
        zipPolygon.setMap(null);
        zipPolygon = null;
    }
}

// Delete marker and polygon from the map
function deleteMarkerAndPolygon(markerId) {
    // Check if the current marker matches the ID and remove it
    if (currentBuildingMarker && currentBuildingMarker.id === markerId) {
        currentBuildingMarker.setMap(null);
        currentBuildingMarker = null;
    }

    // Remove the building polygon if it exists
    if (currentBuildingPolygon) {
        currentBuildingPolygon.setMap(null);
        currentBuildingPolygon = null;
    }

    // Clear other markers from specific industries
    for (const industry in markersByIndustry) {
        markersByIndustry[industry] = markersByIndustry[industry].filter(marker => {
            if (marker.id === markerId) {
                marker.setMap(null); // Remove the marker from the map
                return false; // Remove from the array
            }
            return true;
        });
    }

    closeCustomPopup(); // Close the custom popup
}

// Close custom popup
function closeCustomPopup() {
    infoWindow.close();
}

// Helper function to clear all markers
function clearAllMarkers() {
    for (const industry in markersByIndustry) {
        markersByIndustry[industry].forEach(marker => marker.setMap(null));
        markersByIndustry[industry] = [];
    }
}

function showCustomPopup(marker, industry, area) {
    const buildingLocation = marker.getPosition();
    const formattedArea = parseInt(area).toLocaleString(); // Format square footage with commas

    // Use reverse geocoding to get an accurate address
    geocoder.geocode({ 'location': buildingLocation }, function (results, status) {
        if (status === google.maps.GeocoderStatus.OK && results[0]) {
            const address = results[0].formatted_address;
            const googleMapsLink = `https://www.google.com/maps?q=${buildingLocation.lat()},${buildingLocation.lng()}`;

            // Use Google Places API to get the actual building name
            const request = {
                location: buildingLocation,
                radius: '5',
                query: industry
            };
            placesService.textSearch(request, (results, status) => {
                let buildingName = industry; // Default to industry type if name is not available
                if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                    buildingName = results[0].name || industry; // Use actual name if available
                }

                // Construct the custom popup
                customPopup = `
                    <div class="custom-popup">
                        <div class="popup-header">
                            <strong>${buildingName}</strong> <!-- Display building name -->
                            <div class="action-btns">
                                <button class="delete-btn" onclick="deleteMarkerAndPolygon(${marker.id})">
                                    <i class="ri-delete-bin-line"></i>
                                </button>
                                <button class="close-btn" onclick="closeCustomPopup()">&times;</button>
                            </div>
                        </div>
                        <div class="popup-body">
                            <span id="address-text">${address}</span>
                            <button class="copy-btn" onclick="copyToClipboard('address-text')" title="Copy Address">
                                <i class="ri-file-copy-line"></i>
                            </button><br>
                            Area: <span id="area-text">${formattedArea}</span> square feet
                            <button class="copy-btn" onclick="copySquareFootage('area-text')" title="Copy Square Footage">
                                <i class="ri-file-copy-line"></i>
                            </button><br>
                            <a href="${googleMapsLink}" target="_blank">View on Google Maps</a>
                        </div>
                    </div>
                `;

                infoWindow.setContent(customPopup);
                infoWindow.open(map, marker);
            });
        } else {
            console.error('Geocode was not successful for the following reason: ' + status);
        }
    });
}

// Copy to clipboard function for general text
function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(function () {
        showNotification('Copied to Clipboard');
    }).catch(function () {
        console.error('Failed to copy text.');
    });
}

// Copy function specifically for square footage
function copySquareFootage(elementId) {
    const text = document.getElementById(elementId).innerText;
    const numberOnly = text.replace(/[^\d,]/g, ''); // Remove everything except numbers and commas
    navigator.clipboard.writeText(numberOnly).then(function () {
        showNotification('Copied to Clipboard');
    }).catch(function () {
        console.error('Failed to copy square footage.');
    });
}

// Show notification function
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.innerHTML = message;
    notification.classList.add('show');
    setTimeout(function () {
        notification.classList.remove('show');
    }, 2000);
}

// Add click listener for the marker to reopen the popup
function addMarkerClickListener(marker, industry, area) {
    marker.addListener('click', () => {
        showCustomPopup(marker, industry, area);
    });
}

// Toggle markers by industry type
function toggleIndustryMarkers(industry) {
    const checkBox = document.getElementById(`${industry}-checkbox`);
    const markers = markersByIndustry[industry];

    if (!markers) return;

    markers.forEach(marker => {
        marker.setMap(checkBox.checked ? map : null);
    });
}

// Initialize checkboxes for building types
function createIndustryCheckboxes() {
    const checkboxContainer = document.querySelector('.checkbox-container-insights');
    Object.keys(buildingTypes).forEach(industry => {
        const label = document.createElement('label');
        label.classList.add('checkbox-item-insights');
        label.innerHTML = `
            <input type="checkbox" id="${industry}-checkbox" checked onclick="toggleIndustryMarkers('${industry}')"> ${industry}
        `;
        checkboxContainer.appendChild(label);
    });
}

// Toggle the search mode between ZIP and Address
function toggleSearchMode() {
    const slider = document.querySelector('.slider');
    const searchBtn = document.getElementById('searchBtn');
    const zipInput = document.getElementById('zipInput');
    const addressInput = document.getElementById('addressInput');
    const toggleLabel = document.querySelector('.toggle-label');

    slider.classList.toggle('active');

    if (slider.classList.contains('active')) {
        // Switch to Address Search
        zipInput.style.display = 'none';
        addressInput.style.display = 'block';
        searchBtn.textContent = 'Search Address';
        searchBtn.setAttribute('onclick', 'searchAddress()');
        toggleLabel.textContent = 'Address Search';
    } else {
        // Switch to ZIP Code Search
        zipInput.style.display = 'block';
        addressInput.style.display = 'none';
        searchBtn.textContent = 'Search ZIP Code';
        searchBtn.setAttribute('onclick', 'searchZipCode()');
        toggleLabel.textContent = 'ZIP Code Search';
    }
}

// Search ZIP Code
function searchZipCode() {
    const zipCode = document.getElementById('zipInput').value;
    clearAllMarkersAndPolygons(); // Clear previous markers and polygons

    geocoder.geocode({ 'address': zipCode }, function (results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
            map.setCenter(results[0].geometry.location);
            map.fitBounds(results[0].geometry.viewport);
            loadZipBoundary(zipCode, results[0].address_components);
        } else {
            alert('Geocode was not successful for the following reason: ' + status);
        }
    });
}

// Load and draw ZIP boundary
function loadZipBoundary(zipCode, addressComponents) {
    const stateComponent = addressComponents.find(component => component.types.includes("administrative_area_level_1"));
    if (!stateComponent) {
        alert('Could not find state for ZIP code');
        return;
    }

    const stateName = stateComponent.long_name.toLowerCase().replace(/\s+/g, '_');
    const stateCode = stateComponent.short_name.toLowerCase();
    const zipCodeGeoJSONUrl = `https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/${stateCode}_${stateName}_zip_codes_geo.min.json`;

    fetch(zipCodeGeoJSONUrl)
        .then(response => response.json())
        .then(data => {
            const zipFeature = data.features.find(f => f.properties.ZCTA5CE10 === zipCode);
            if (zipFeature) {
                drawZipCodeBoundary(zipFeature.geometry.coordinates);
                searchAllIndustryTypes(zipFeature.geometry.coordinates);
            } else {
                alert(`No boundary found for ZIP code: ${zipCode}`);
            }
        })
        .catch(error => console.error('Error loading ZIP code boundary:', error));
}

// Draw ZIP Code boundary
function drawZipCodeBoundary(coordinates) {
    if (zipPolygon) {
        zipPolygon.setMap(null); // Remove previous ZIP polygon
    }

    const zipPolygonPaths = coordinates[0].map(point => {
        return { lat: point[1], lng: point[0] };
    });

    zipPolygon = new google.maps.Polygon({
        paths: zipPolygonPaths,
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.1,
    });

    zipPolygon.setMap(map);
}

// Start the entire process
function initialize() {
    initMap(); // Initialize the Google Map
    createIndustryCheckboxes(); // Create checkboxes for industries
    initUploadSidebar(); // Initialize file upload sidebar

    // Set download button event listener
    document.getElementById('downloadBtn').addEventListener('click', function () {
        downloadUpdatedData();
    });

    // Set search button event listener
    document.getElementById('searchBtn').addEventListener('click', function () {
        if (document.querySelector('.slider').classList.contains('active')) {
            searchAddress();
        } else {
            searchZipCode();
        }
    });

    // Set toggle insights sidebar
    document.getElementById('toggleInsightsBtn').addEventListener('click', toggleInsightsSidebar);

    // Set search mode toggle event listener
    document.getElementById('searchToggle').addEventListener('click', toggleSearchMode);

    // Set close PDF viewer event listener
    document.getElementById('pdfViewerCloseBtn').addEventListener('click', closePdfViewerModal);
}

// Function to process file and update progress bar
async function processFile() {
    if (excelData.length === 0) {
        alert('Please upload a valid Excel file');
        return;
    }

    // Show progress bar
    document.querySelector('.progress-container').style.display = 'block';

    // Add new column header for the updated square footage
    excelData[0]['Updated Square Footage'] = '';

    for (let i = 0; i < excelData.length; i++) {
        const row = excelData[i];
        const address = `${row['Location Street']}, ${row['Location City']}, ${row['Location State']}, ${row['Location Zipcode']}`;
        const latLng = await geocodeAddress(address);
        if (latLng) {
            const squareFootage = await fetchOverpassSquareFootage(latLng.lat, latLng.lng);
            row['Updated Square Footage'] = squareFootage ? squareFootage : 'N/A'; // Add new sqft in new column
        }

        // Update progress bar
        const progress = Math.round(((i + 1) / excelData.length) * 100);
        progressBar.style.width = progress + '%';
        progressBar.innerHTML = progress + '%';
    }

    // Hide progress bar when done
    document.querySelector('.progress-container').style.display = 'none';

    // Show download button
    document.getElementById('downloadBtn').style.display = 'block';
}

// Download the updated Excel data
function downloadUpdatedData() {
    const newWorkbook = XLSX.utils.book_new();
    const newSheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Updated Data');
    XLSX.writeFile(newWorkbook, 'updated_square_footage.xlsx');
}

// Geocode address using Google Maps API
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        geocoder.geocode({ 'address': address }, function (results, status) {
            if (status === 'OK') {
                const location = results[0].geometry.location;
                resolve({ lat: location.lat(), lng: location.lng() });
            } else {
                console.error('Geocode error:', status);
                resolve(null);
            }
        });
    });
}

// Fetch building data and calculate square footage using Overpass API
function fetchOverpassSquareFootage(lat, lng) {
    return new Promise((resolve, reject) => {
        const overpassQuery = `
            [out:json];
            way["building"](around:50,${lat},${lng});
            out body;
            >;
            out skel qt;
        `;
        const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQuery);

        fetch(overpassUrl)
            .then(response => response.json())
            .then(data => {
                const buildings = data.elements.filter(el => el.type === 'way');
                if (buildings.length > 0) {
                    const coords = getBuildingCoordinates(buildings[0], data);
                    const area = calculatePolygonArea(coords);
                    resolve(area);
                } else {
                    resolve(null);
                }
            })
            .catch(error => {
                console.error('Overpass API error:', error);
                resolve(null);
            });
    });
}

// Extract coordinates of building nodes from Overpass data
function getBuildingCoordinates(building, data) {
    const coords = [];
    if (building.nodes && building.nodes.length > 0) {
        building.nodes.forEach(nodeId => {
            const node = data.elements.find(el => el.type === 'node' && el.id === nodeId);
            if (node) {
                coords.push([node.lon, node.lat]);
            }
        });
    }
    return coords;
}

// Calculate the area of the polygon using Turf.js
function calculatePolygonArea(coords) {
    const polygon = turf.polygon([coords]);
    const areaInSquareMeters = turf.area(polygon);
    const areaInSquareFeet = areaInSquareMeters * 10.7639; // Convert sq meters to sq feet
    return Math.round(areaInSquareFeet);
}

// Search for buildings by industry type within ZIP boundary
function searchAllIndustryTypes(coordinates) {
    let promises = Object.keys(buildingTypes).map(industry => searchBuildingsByIndustry(industry, coordinates));

    // Wait for all industry searches to finish before checking if there are any markers
    Promise.all(promises).then(markersAdded => {
        if (!markersAdded.some(added => added > 0)) {
            alert("No markers found within the ZIP code boundary.");
        }
    });
}

// Search for specific buildings by industry
function searchBuildingsByIndustry(industry, coordinates) {
    return new Promise((resolve, reject) => {
        const buildingTypesForIndustry = buildingTypes[industry];
        const sqftThreshold = sqftRequirements[industry];

        if (!buildingTypesForIndustry || buildingTypesForIndustry.length === 0) {
            resolve(0);
            return;
        }

        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();

        const overpassQuery = `
            [out:json];
            (
                ${buildingTypesForIndustry.map(type => `way["building"="${type}"](${southWest.lat()},${southWest.lng()},${northEast.lat()},${northEast.lng()});`).join('')}
            );
            out geom;
        `;
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

        fetch(overpassUrl)
            .then(response => response.json())
            .then(data => {
                if (!markersByIndustry[industry]) {
                    markersByIndustry[industry] = [];
                }

                const elements = data.elements;
                if (elements.length === 0) {
                    resolve(0);
                    return;
                }

                let markersAdded = 0;

                elements.forEach(element => {
                    if (element.type === "way" && element.geometry) {
                        const path = element.geometry.map(point => ({
                            lat: point.lat,
                            lng: point.lon
                        }));

                        const buildingPolygon = new google.maps.Polygon({ paths: path });
                        const areaMeters = google.maps.geometry.spherical.computeArea(buildingPolygon.getPath());
                        const areaFeet = areaMeters * 10.7639;

                        if (areaFeet >= sqftThreshold && google.maps.geometry.poly.containsLocation(buildingPolygon.getPath().getAt(0), zipPolygon)) {
                            const buildingLocation = buildingPolygon.getPath().getAt(0);
                            const marker = new google.maps.Marker({
                                position: buildingLocation,
                                map: map,
                                icon: {
                                    url: `http://maps.google.com/mapfiles/ms/icons/${markerColors[industry]}-dot.png`
                                }
                            });

                            // Fetch building name using Google Places API
                            const request = {
                                location: buildingLocation,
                                radius: '5',
                                query: industry
                            };

                            placesService.textSearch(request, (results, status) => {
                                let buildingName = industry; // Default to industry type
                                if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                                    buildingName = results[0].name || industry;
                                }

                                // Assign name to marker and update popup when clicked
                                marker.addListener('click', () => {
                                    showCustomPopup(marker, buildingName, areaFeet.toFixed(2)); // Pass building name to popup
                                });
                            });

                            // Assign a unique ID and add marker to the map
                            marker.id = markerCounter++;
                            markersByIndustry[industry].push(marker);
                            markersAdded++;
                        }
                    }
                });

                resolve(markersAdded);
            })
            .catch(error => {
                console.error('Error fetching data from Overpass API:', error);
                reject(error);
            });
    });
}

// Toggle insights sidebar
function toggleInsightsSidebar() {
    const insightsSidebar = document.getElementById('insightsSidebar');
    insightsSidebar.classList.toggle('open');
}

// Start the initialization
document.addEventListener('DOMContentLoaded', initialize);