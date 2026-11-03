import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Navigation, ExternalLink, Loader } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { directionsUrl, mapsAppName, mapsSearchUrl } from '../../lib/mapsLinks';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The whole address: street, city, state and zip, so the right house is found. */
  address: string;
  /** Whose place it is: the client or lead name, shown on the pin. */
  clientName?: string;
}

/** Map tiles that match the app's theme (both free, from CARTO). */
const tilesFor = (light: boolean) =>
  ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com/${light ? 'light_all' : 'dark_all'}/{z}/{x}/{y}@2x.png`);

/**
 * An address on a map, with Directions in the device's maps app (Apple Maps on
 * iPhone, iPad and Mac, Google Maps elsewhere). Opens above any drawer.
 * Loaded on demand through AddressLink, so MapLibre downloads only when needed.
 */
export const MapModal: React.FC<MapModalProps> = ({ isOpen, onClose, address, clientName }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !mapContainer.current || !address) return;
    let cancelled = false;

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Find the address with Photon (OpenStreetMap-based, no key needed).
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`);
        if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
        const data = await response.json();
        if (cancelled) return;

        if (data.features && data.features.length > 0 && mapContainer.current) {
          const [lng, lat] = data.features[0].geometry.coordinates;
          const light = document.documentElement.classList.contains('light');
          map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
              version: 8,
              sources: {
                carto: {
                  type: 'raster',
                  tiles: tilesFor(light),
                  tileSize: 256,
                  attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                },
              },
              layers: [{ id: 'carto-layer', type: 'raster', source: 'carto', minzoom: 0, maxzoom: 22 }],
            },
            center: [lng, lat],
            zoom: 15,
            pitch: 45,
            bearing: -17.6,
          });
          map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
          map.current.on('load', () => {
            // The name is shown as text: it comes from what people typed.
            new maplibregl.Marker({ color: '#336699' })
              .setLngLat([lng, lat])
              .setPopup(new maplibregl.Popup({ offset: 25 }).setText(clientName || 'Job site'))
              .addTo(map.current!);
            setIsLoading(false);
          });
        } else {
          setError("Couldn't find that address on the map.");
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Map initialization error:', err);
        setError("Couldn't load the map.");
        setIsLoading(false);
      }
    };

    initializeMap();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [isOpen, address, clientName]);

  // Esc closes it.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const app = mapsAppName();
  const actions = (
    <div className="flex flex-wrap gap-3">
      <a
        href={directionsUrl(address)}
        target="_blank"
        rel="noreferrer"
        className="min-h-[44px] px-4 inline-flex items-center gap-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors text-sm font-medium"
      >
        <Navigation className="w-4 h-4" />
        Directions
      </a>
      <a
        href={mapsSearchUrl(address)}
        target="_blank"
        rel="noreferrer"
        className="min-h-[44px] px-4 inline-flex items-center gap-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors text-sm"
      >
        <ExternalLink className="w-4 h-4" />
        Open in {app}
      </a>
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Map: ${address}`}
      className="fixed inset-0 z-[11200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="map-backdrop"
    >
      <div className="bg-[#1E1E1E] border border-[#333] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[#333]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{clientName || 'Job site'}</span>
            </h2>
            <p className="text-sm text-gray-400 mt-1">{address}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="w-11 h-11 -mr-2 -mt-2 flex flex-shrink-0 items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-[#0a0a0a]" style={{ height: 'min(500px, 60vh)' }}>
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <MapPin className="w-12 h-12 text-gray-600 mb-4" />
              <p className="text-sm text-gray-300 mb-6 max-w-md">{error} You can still open it in {app}.</p>
              {actions}
            </div>
          ) : (
            <div ref={mapContainer} className="w-full h-full" data-testid="map-canvas" />
          )}
        </div>

        {!error && <div className="p-4 border-t border-[#333]">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default MapModal;
