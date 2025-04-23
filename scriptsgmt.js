/*********************************************************
 *  Full JS Code Example: OSM Buildings (with holes),
 *  using the OSM "name" tag if available
 *********************************************************/

let map;
let markersByIndustry = {};
let infoWindow;
let customPopup;
let placesService;
let geocoder;
let zipPolygon;

// Because we can have multiple polygons displayed at once,
// store them in an array instead of a single 'currentBuildingPolygon'.
let currentBuildingPolygons = [];
let currentBuildingMarker = null;
let markerCounter = 0;
let excelData = [];

const progressBar = document.getElementById('progressBar');

// Example building “industry” categories + typical building tags
const buildingTypes = {
  'Commercial - General': [
    'office', 'commercial', 'warehouse', 'hotel', 'apartment', 'residential', 'public_building',
    'apartments', 'public', 'hotel', 'commercial;residential', 'sports_centre', 'stadium', 'sports_hall',
    'kitchen', 'government_office', 'bank', 'storage', 'museum', 'sport', 'community_centre',
    'motel', 'library', 'townhall', 'theatre', 'cinema', 'recreation', 'aviary', 'hostel', 'gym',
    'exhibition_hall', 'observatory', 'recreational', 'laboratory', 'arena'
  ],
  'Industrial': [
    'industrial', 'factory', 'manufacture', 'works', 'warehouse', 'sawmill', 'processing_plant', 'power_substation',
    'utility', 'electricity', 'car_repair', 'power', 'brewery', 'pumping_station', 'industrial;yes', 'transformer',
    'sub_station', 'power_plant', 'yes;industrial', 'power_station', 'industrial␣building'
  ],
  'School': [
    'school', 'college', 'university', 'kindergarten', 'education', 'academic', 'dormitory', 'educational',
    'school;yes', 'yes;school', 'academic', 'high␣school', 'school;roof', 'preschool', 'school;kindergarten',
    'kindergarten;school', 'School'
  ],
  'Commercial - Retail': ['retail', 'store', 'mall', 'supermarket', 'kiosk', 'shop', 'market', 'shopping'],
  'Commercial - Grocery Store': ['supermarket', 'grocery', 'retail'],
  'Hospital': [
    'hospital', 'clinic', 'nursing_home', 'healthcare', 'sanatorium', 'social_facility', 'policlinic', 'doctors',
    'medical', 'yes;hospital', 'retirement_home', 'health_care', 'care_home', 'hospital;yes'
  ],
  'Aggregates': ['quarry', 'mining', 'silo', 'gravel'],
  'Waste & Water Treatment': ['waste', 'water_treatment', 'recycling', 'landfill', 'sewage_treatment', 'waste_disposal'],
  'Oil & Gas': ['oil', 'gas', 'refinery', 'petroleum', 'oil_terminal', 'fuel'],
  'Cold Storage': ['cold_storage'],
  'Data Center': ['data_center'],
  'Temperature-Controlled Greenhouse': ['greenhouse', 'conservatory', 'glasshouse', 'greenhouse_horticulture'],
  'Energy Intensive Farm': ['dairy', 'agricultural', 'farm_auxiliary', 'poultry_house', 'livestock', 'agriculture', 'poultry_stable']
};

// Marker colors (Google Maps icon set)
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

// Example square footage “threshold” by category
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


/*********************************************************
 *  Initialization & Basic UI
 *********************************************************/

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 40.730610, lng: -73.935242 },
    zoom: 13,
  });

  placesService = new google.maps.places.PlacesService(map);
  geocoder = new google.maps.Geocoder();
  infoWindow = new google.maps.InfoWindow();
}

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

// Handle file upload and process automatically
document.getElementById('fileUpload').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      excelData = XLSX.utils.sheet_to_json(firstSheet);
      processFile();  // Automatically process after upload
    };
    reader.readAsArrayBuffer(file);
  }
});

// Download button
document.getElementById('downloadBtn').addEventListener('click', function () {
  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(excelData);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Updated Data');
  XLSX.writeFile(newWorkbook, 'updated_square_footage.xlsx');
});


/*********************************************************
 *  Drawing & Clearing Polygons
 *********************************************************/

function drawBuildingPolygon(coords) {
  // Remove any previously drawn building polygons
  if (currentBuildingPolygons.length > 0) {
    currentBuildingPolygons.forEach(poly => poly.setMap(null));
  }
  currentBuildingPolygons = [];

  // For simplicity, just draw the outer rings in red. 
  // If you want to visually “cut out” holes, you’d have to use 
  // separate polygons with fill set to map background, or other advanced logic.
  coords.forEach((polygon) => {
    // polygon[0] is the outer ring, polygon[1..n] are the holes
    const outerRing = polygon[0];
    const googleOuterCoords = outerRing.map(coord => ({
      lat: coord[1],
      lng: coord[0],
    }));

    const poly = new google.maps.Polygon({
      paths: googleOuterCoords,
      strokeColor: "#FF0000",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#FF0000",
      fillOpacity: 0.35
    });
    poly.setMap(map);
    currentBuildingPolygons.push(poly);
  });
}

/**
 * Clear all markers and polygons from the map
 */
function clearAllMarkersAndPolygons() {
  // Clear markers
  for (const industry in markersByIndustry) {
    markersByIndustry[industry].forEach(marker => marker.setMap(null));
    markersByIndustry[industry] = [];
  }

  // Clear the current building marker
  if (currentBuildingMarker) {
    currentBuildingMarker.setMap(null);
    currentBuildingMarker = null;
  }

  // Clear the building polygons
  if (currentBuildingPolygons.length > 0) {
    currentBuildingPolygons.forEach(poly => poly.setMap(null));
    currentBuildingPolygons = [];
  }

  // Clear the ZIP polygon
  if (zipPolygon) {
    zipPolygon.setMap(null);
    zipPolygon = null;
  }
}

/**
 * Delete a specific marker/polygon by marker ID
 */
function deleteMarkerAndPolygon(markerId) {
  // Remove the building marker if it matches
  if (currentBuildingMarker && currentBuildingMarker.id === markerId) {
    currentBuildingMarker.setMap(null);
    currentBuildingMarker = null;
  }

  // Remove the building polygons
  if (currentBuildingPolygons.length > 0) {
    currentBuildingPolygons.forEach(poly => poly.setMap(null));
    currentBuildingPolygons = [];
  }

  // Remove from industry arrays
  for (const industry in markersByIndustry) {
    markersByIndustry[industry] = markersByIndustry[industry].filter(marker => {
      if (marker.id === markerId) {
        marker.setMap(null);
        return false;
      }
      return true;
    });
  }

  closeCustomPopup();
}


/*********************************************************
 *  InfoWindow / Pop-up Utilities
 *********************************************************/

function closeCustomPopup() {
  infoWindow.close();
}

function showCustomPopup(marker, buildingName, area) {
  const buildingLocation = marker.getPosition();
  const formattedArea = parseInt(area).toLocaleString(); // Comma format

  // Reverse geocode to get a best-effort address
  geocoder.geocode({ 'location': buildingLocation }, function (results, status) {
    if (status === google.maps.GeocoderStatus.OK && results[0]) {
      const address = results[0].formatted_address;
      const googleMapsLink = `https://www.google.com/maps?q=${buildingLocation.lat()},${buildingLocation.lng()}`;

      // If buildingName is blank, we can do a minimal fallback or Google Places
      const request = {
        location: buildingLocation,
        radius: '5',
        query: buildingName
      };
      placesService.textSearch(request, (results, status) => {
        // If buildingName wasn't set from OSM name, fallback to Places name
        let finalName = buildingName;
        if (!finalName || finalName === 'Specific Building') {
          if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
            finalName = results[0].name || buildingName;
          }
        }

        // Custom popup HTML
        customPopup = `
          <div class="custom-popup">
            <div class="popup-header">
              <strong>${finalName}</strong>
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

function copyToClipboard(elementId) {
  const text = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(text).then(function () {
    showNotification('Copied to Clipboard');
  }).catch(function () {
    console.error('Failed to copy text.');
  });
}

function copySquareFootage(elementId) {
  const text = document.getElementById(elementId).innerText;
  const numberOnly = text.replace(/[^\d,]/g, '');
  navigator.clipboard.writeText(numberOnly).then(function () {
    showNotification('Copied to Clipboard');
  }).catch(function () {
    console.error('Failed to copy square footage.');
  });
}

function showNotification(message) {
  const notification = document.getElementById('notification');
  notification.innerHTML = message;
  notification.classList.add('show');
  setTimeout(function () {
    notification.classList.remove('show');
  }, 2000);
}


/*********************************************************
 *  Searching by Address
 *********************************************************/

function searchAddress() {
  const address = document.getElementById('addressInput').value;
  clearAllMarkersAndPolygons();

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

/**
 *  For a given address lat/lng, fetch area + OSM name if it exists,
 *  then draw + show popup.
 */
function loadAddressBuilding(location) {
  const lat = location.lat();
  const lng = location.lng();

  // 1) fetch area
  fetchOverpassSquareFootage(lat, lng).then(squareFootage => {
    if (squareFootage) {
      // Remove previous marker
      if (currentBuildingMarker) {
        currentBuildingMarker.setMap(null);
      }

      // Create new marker
      currentBuildingMarker = new google.maps.Marker({
        position: location,
        map: map,
        icon: { url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }
      });
      currentBuildingMarker.id = markerCounter++;

      // 2) fetch coords & name
      fetchBuildingData(lat, lng).then(bldgData => {
        if (bldgData && bldgData.coords && bldgData.coords.length > 0) {
          // Draw polygon
          drawBuildingPolygon(bldgData.coords);

          // Use the OSM name if available, else “Specific Building”
          const finalName = bldgData.name || 'Specific Building';
          showCustomPopup(currentBuildingMarker, finalName, squareFootage.toFixed(2));

          // Reopen popup on click
          currentBuildingMarker.addListener('click', () => {
            showCustomPopup(currentBuildingMarker, finalName, squareFootage.toFixed(2));
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


/*********************************************************
 *  Searching by ZIP
 *********************************************************/

function searchZipCode() {
  const zipCode = document.getElementById('zipInput').value;
  clearAllMarkersAndPolygons();

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

function loadZipBoundary(zipCode, addressComponents) {
  const stateComponent = addressComponents.find(c => c.types.includes("administrative_area_level_1"));
  if (!stateComponent) {
    alert('Could not find state for ZIP code');
    return;
  }

  const stateName = stateComponent.long_name.toLowerCase().replace(/\s+/g, '_');
  const stateCode = stateComponent.short_name.toLowerCase();
  const zipCodeGeoJSONUrl =
    `https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/${stateCode}_${stateName}_zip_codes_geo.min.json`;

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

function drawZipCodeBoundary(coordinates) {
  if (zipPolygon) {
    zipPolygon.setMap(null);
  }

  // Typically coordinates[0] is the outer ring for a single polygon
  const zipPolygonPaths = coordinates[0].map(pt => ({ lat: pt[1], lng: pt[0] }));

  zipPolygon = new google.maps.Polygon({
    paths: zipPolygonPaths,
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#FF0000',
    fillOpacity: 0.1
  });
  zipPolygon.setMap(map);
}


/*********************************************************
 *  Overpass / OSM Queries
 *********************************************************/

/**
 * Overpass query for the building nearest (within ~50m) the given lat/lng
 * and compute the area (including holes / multipolygons).
 */
function fetchOverpassSquareFootage(lat, lng) {
  return new Promise((resolve) => {
    const overpassQuery = `
      [out:json];
      nwr["building"](around:50,${lat},${lng});
      out geom;
    `;
    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQuery);

    fetch(overpassUrl)
      .then(response => response.json())
      .then(data => {
        const buildings = data.elements.filter(el => el.tags && el.tags.building);
        if (buildings.length > 0) {
          // Take first building
          const bldgEl = buildings[0];
          const coords = getBuildingCoordinates(bldgEl);
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

/**
 * Fetch BOTH the geometry and the name (if any) from the first OSM building
 * around (lat, lng).
 */
function fetchBuildingData(lat, lng) {
  return new Promise((resolve) => {
    const overpassQuery = `
      [out:json];
      nwr["building"](around:50,${lat},${lng});
      out geom;
    `;
    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQuery);

    fetch(overpassUrl)
      .then(response => response.json())
      .then(data => {
        const buildings = data.elements.filter(el => el.tags && el.tags.building);
        if (buildings.length > 0) {
          const bldgEl = buildings[0];
          const coords = getBuildingCoordinates(bldgEl);
          // If building has a "name" tag, use that.
          const name = bldgEl.tags.name || null;
          resolve({ coords, name });
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

function getBuildingCoordinates(buildingElement) {
  // NODES – trivial single point
  if (buildingElement.type === 'node' && buildingElement.lat && buildingElement.lon) {
    // Return an array with 1 polygon, whose outer ring has 1 coordinate
    return [ [ [ [buildingElement.lon, buildingElement.lat] ] ] ];
  }

  // WAYS – single ring
  if (buildingElement.type === 'way' && buildingElement.geometry) {
    let ring = buildingElement.geometry.map(pt => [pt.lon, pt.lat]);
    if (!coordsAreEqual(ring[0], ring[ring.length - 1])) {
      ring.push(ring[0]);
    }
    return [ [ ring ] ];
  }

  // RELATIONS – can have multiple 'outer' ways and 'inner' ways
  if (buildingElement.type === 'relation' && buildingElement.members) {
    let polygons = [];
    let outerRings = [];
    let innerRings = [];

    buildingElement.members.forEach(member => {
      if (!member.role || !member.geometry) return;
      let ring = member.geometry.map(pt => [pt.lon, pt.lat]);
      if (!coordsAreEqual(ring[0], ring[ring.length - 1])) {
        ring.push(ring[0]);
      }

      if (member.role === 'outer') {
        outerRings.push(ring);
      } else if (member.role === 'inner') {
        innerRings.push(ring);
      }
    });

    // If there's exactly 1 outer ring, treat all inners as holes.
    // If multiple outer rings, each is its own polygon (we won't attempt to match holes).
    if (outerRings.length === 1) {
      polygons.push([ outerRings[0], ...innerRings ]);
    } else {
      outerRings.forEach(o => polygons.push([o]));
    }
    return polygons;
  }

  // fallback
  return [];
}

function coordsAreEqual(c1, c2) {
  return (c1[0] === c2[0] && c1[1] === c2[1]);
}

/**
 * Given an array of polygons (each = [ outerRing, holeRing, holeRing, ...]),
 * compute the total area in sq. feet (accounting for holes).
 */
function calculatePolygonArea(polygons) {
  if (!polygons || polygons.length === 0) return 0;

  // Convert to a valid Turf.js MultiPolygon
  const turfMultiPoly = turf.multiPolygon(polygons);

  const areaInSquareMeters = turf.area(turfMultiPoly);
  const areaInSquareFeet = areaInSquareMeters * 10.7639;
  return Math.round(areaInSquareFeet);
}


/*********************************************************
 *  Industry-wide searching (for all building tags)
 *********************************************************/

function searchAllIndustryTypes(zipCoords) {
  let promises = Object.keys(buildingTypes).map(industry => 
    searchBuildingsByIndustry(industry, zipCoords)
  );

  Promise.all(promises).then(markersAdded => {
    if (!markersAdded.some(added => added > 0)) {
      alert("No markers found within the ZIP code boundary.");
    }
  });
}

/**
 * Search Overpass for each building tag in this industry’s array,
 * check the building area vs. threshold, ensure it’s inside the ZIP polygon,
 * and place a marker with the building name if present.
 */
function searchBuildingsByIndustry(industry, coordinates) {
  return new Promise((resolve, reject) => {
    const buildingTypesForIndustry = buildingTypes[industry];
    const sqftThreshold = sqftRequirements[industry];

    if (!buildingTypesForIndustry || buildingTypesForIndustry.length === 0) {
      resolve(0);
      return;
    }

    // Get bounding box from map
    const bounds = map.getBounds();
    if (!bounds) {
      resolve(0);
      return;
    }
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();

    const overpassQuery = `
      [out:json];
      (
        ${buildingTypesForIndustry
          .map(bt => `nwr["building"="${bt}"](${southWest.lat()},${southWest.lng()},${northEast.lat()},${northEast.lng()});`)
          .join('')}
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

        const elements = data.elements.filter(el => el.tags && el.tags.building);
        if (elements.length === 0) {
          resolve(0);
          return;
        }

        let markersAdded = 0;
        elements.forEach(element => {
          const polygons = getBuildingCoordinates(element);
          if (!polygons || polygons.length === 0) return;

          // Calculate area
          const areaFeet = calculatePolygonArea(polygons);
          if (areaFeet >= sqftThreshold) {
            // Check if it's inside our ZIP polygon
            const firstCoord = polygons[0][0][0]; // [lon, lat]
            const latLng = new google.maps.LatLng(firstCoord[1], firstCoord[0]);
            if (!google.maps.geometry.poly.containsLocation(latLng, zipPolygon)) {
              return; // Not inside the zip polygon
            }

            // If OSM building has a name, use it. Otherwise, default to industry (we still do a Places fallback).
            let buildingName = element.tags.name || industry;

            // Place a marker
            const marker = new google.maps.Marker({
              position: latLng,
              map: map,
              icon: {
                url: `http://maps.google.com/mapfiles/ms/icons/${markerColors[industry]}-dot.png`
              }
            });
            marker.id = markerCounter++;

            // Attempt a Places lookup ONLY if there's no OSM name:
            const request = {
              location: latLng,
              radius: '5',
              query: industry
            };
            placesService.textSearch(request, (results, status) => {
              let finalName = buildingName;
              if (!element.tags.name) {
                // If no OSM name, maybe use Google Places name:
                if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                  finalName = results[0].name || industry;
                }
              }
              // On marker click, show popup
              marker.addListener('click', () => {
                showCustomPopup(marker, finalName, areaFeet.toFixed(2));
              });
            });

            markersByIndustry[industry].push(marker);
            markersAdded++;
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


/*********************************************************
 *  Misc. UI Controls (toggles, checkboxes)
 *********************************************************/

function createIndustryCheckboxes() {
  const checkboxContainer = document.querySelector('.checkbox-container-insights');
  Object.keys(buildingTypes).forEach(ind => {
    const label = document.createElement('label');
    label.classList.add('checkbox-item-insights');
    label.innerHTML = `
      <input type="checkbox" id="${ind}-checkbox" checked onclick="toggleIndustryMarkers('${ind}')"> ${ind}
    `;
    checkboxContainer.appendChild(label);
  });
}

function toggleIndustryMarkers(industry) {
  const checkBox = document.getElementById(`${industry}-checkbox`);
  const markers = markersByIndustry[industry];
  if (!markers) return;
  markers.forEach(marker => {
    marker.setMap(checkBox.checked ? map : null);
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
  toggleInsightsSidebar();
}

function toggleInsightsSidebar() {
  const insightsSidebar = document.getElementById('insightsSidebar');
  insightsSidebar.classList.toggle('open');
}

/*********************************************************
 *  Excel Processing
 *********************************************************/

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
      row['Updated Square Footage'] = squareFootage ? squareFootage : 'N/A';
    }

    // Update progress
    const progress = Math.round(((i + 1) / excelData.length) * 100);
    progressBar.style.width = progress + '%';
    progressBar.innerHTML = progress + '%';
  }

  // Hide progress bar when done
  document.querySelector('.progress-container').style.display = 'none';

  // Show download button
  document.getElementById('downloadBtn').style.display = 'block';
}

function geocodeAddress(address) {
  return new Promise((resolve) => {
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

function downloadUpdatedData() {
  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(excelData);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Updated Data');
  XLSX.writeFile(newWorkbook, 'updated_square_footage.xlsx');
}


/*********************************************************
 *  Page onLoad
 *********************************************************/

function initialize() {
  initMap();
  createIndustryCheckboxes();

  // Example: set up the search button
  document.getElementById('searchBtn').addEventListener('click', function () {
    if (document.querySelector('.slider').classList.contains('active')) {
      searchAddress();
    } else {
      searchZipCode();
    }
  });

  // The toggle for ZIP vs. Address
  document.getElementById('searchToggle').addEventListener('click', toggleSearchMode);

  // Example PDF viewer close
  document.getElementById('pdfViewerCloseBtn').addEventListener('click', closeDocumentationModal);
}

document.addEventListener('DOMContentLoaded', initialize);
