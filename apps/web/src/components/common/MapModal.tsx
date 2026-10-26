import React, { useEffect, useRef, useState } from 'react';
import { X, MapPin, Navigation, ExternalLink, Loader } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  clientName?: string;
}

export const MapModal: React.FC<MapModalProps> = ({ isOpen, onClose, address, clientName }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!isOpen || !mapContainer.current || !address) return;
    
    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Geocode the address using Photon (OpenStreetMap-based, CORS-enabled)
        const geocodeUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`;
        const response = await fetch(geocodeUrl);
        
        if (!response.ok) {
          throw new Error(`Geocoding failed: ${response.status}`);
        }
        
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error('Failed to parse geocoding response:', jsonError);
          throw new Error('Invalid response from geocoding service');
        }
        
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].geometry.coordinates;
          
          // Initialize the map with CartoDB's dark matter tiles (free)
          map.current = new maplibregl.Map({
            container: mapContainer.current!,
            style: {
              'version': 8,
              'sources': {
                'carto-dark': {
                  'type': 'raster',
                  'tiles': [
                    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                  ],
                  'tileSize': 256,
                  'attribution': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                }
              },
              'layers': [{
                'id': 'carto-dark-layer',
                'type': 'raster',
                'source': 'carto-dark',
                'minzoom': 0,
                'maxzoom': 22
              }]
            },
            center: [lng, lat],
            zoom: 15,
            pitch: 45, // 3D view angle
            bearing: -17.6 // Rotation angle
          });
          
          // Add navigation controls
          map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
          
          // Wait for map to load
          map.current.on('load', () => {
            // Add marker at the location
            new maplibregl.Marker({ color: '#336699' })
              .setLngLat([lng, lat])
              .setPopup(
                new maplibregl.Popup({ offset: 25 })
                  .setHTML(`<div class="text-black font-medium">${clientName || 'Project Location'}</div>`)
              )
              .addTo(map.current!);
            
            setIsLoading(false);
          });
        } else {
          setError('Unable to find location');
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Map initialization error:', err);
        setError('Failed to load map');
        setIsLoading(false);
      }
    };
    
    initializeMap();
    
    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isOpen, address, clientName]);

  const openInGoogleMaps = () => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const getDirections = () => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
  };

  if (!isOpen) return null;
  
  // Additional validation for address
  if (!address || address.trim() === '') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-[#1E1E1E] rounded-lg p-8 max-w-md">
          <h2 className="text-lg font-semibold text-white mb-4">Invalid Address</h2>
          <p className="text-gray-400 mb-6">No valid address provided for this location.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-[#1E1E1E] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {clientName ? `${clientName} - Location` : 'Project Location'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">{address}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="relative h-[500px] bg-[#0a0a0a]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          )}
          
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <MapPin className="w-16 h-16 text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Map Error</h3>
              <p className="text-sm text-gray-400 mb-6 max-w-md">{error}</p>
              <div className="flex gap-3">
                <button
                  onClick={openInGoogleMaps}
                  className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Google Maps
                </button>
                <button
                  onClick={getDirections}
                  className="px-4 py-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors flex items-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </button>
              </div>
            </div>
          ) : (
            <div ref={mapContainer} className="w-full h-full" />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between p-4 border-t border-[#333]">
          <div className="flex gap-2">
            <button
              onClick={openInGoogleMaps}
              className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors text-sm flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Google Maps
            </button>
            <button
              onClick={getDirections}
              className="px-4 py-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors text-sm flex items-center gap-2"
            >
              <Navigation className="w-4 h-4" />
              Get Directions
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};