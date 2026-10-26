import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Add custom CSS for popups and markers
const style = document.createElement('style');
style.textContent = `
  .project-popup {
    z-index: 1000 !important;
  }
  .project-popup .maplibregl-popup-content {
    background: #1E1E1E;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000 !important;
  }
  .project-popup .maplibregl-popup-tip {
    border-top-color: #1E1E1E;
  }
  .custom-marker {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .custom-marker:hover {
    transform: translateY(-2px);
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  }
  .cluster-marker {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .cluster-marker:hover {
    transform: translateY(-2px);
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  }
`;
document.head.appendChild(style);
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';
import { MapPin, Loader, AlertCircle, X, DollarSign, Calendar, Building2, Ruler } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface ProjectLocation {
  id: string;
  name: string;
  address: string;
  client_name: string;
  status: string;
  total_amount: number;
  start_date: string;
  coordinates?: [number, number];
  profit_margin?: number;
}

interface ProjectsOverviewMapProps {
  selectedStatus?: string;
  filteredProjectIds?: string[];
}

export const ProjectsOverviewMap: React.FC<ProjectsOverviewMapProps> = ({ selectedStatus = 'all', filteredProjectIds }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [projects, setProjects] = useState<ProjectLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectLocation | null>(null);
  const [realtimeUpdate, setRealtimeUpdate] = useState<{ type: string; project: string } | null>(null);
  const [propertyData, setPropertyData] = useState<{ 
    building?: any; 
    area?: number;
    loading?: boolean;
    isApproximate?: boolean;
    centroid?: [number, number];
  } | null>(null);
  const buildingLayerId = useRef<string>('building-footprint');
  const { selectedOrg } = useContext(OrganizationContext);
  const navigate = useNavigate();

  // Fetch all projects with addresses
  useEffect(() => {
    const fetchProjects = async () => {
      if (!selectedOrg?.id) return;

      try {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            id,
            name,
            status,
            budget,
            start_date,
            client_id,
            address,
            city,
            state,
            zip_code,
            latitude,
            longitude,
            clients(
              name
            )
          `)
          .eq('organization_id', selectedOrg.id)
          .not('address', 'is', null);

        if (error) throw error;

        console.log('Raw projects from DB:', data?.length);
        console.log('Planned projects from DB:', data?.filter(p => p.status === 'planned').length);
        
        // Also check if any planned projects are missing from the data
        const { data: allPlannedProjects } = await supabase
          .from('projects')
          .select('id, name, status, address')
          .eq('organization_id', selectedOrg.id)
          .eq('status', 'planned');
          
        console.log('Total planned projects in DB:', allPlannedProjects?.length);
        if (allPlannedProjects && data) {
          const mapProjectIds = new Set(data.map(p => p.id));
          const missingProjects = allPlannedProjects.filter(p => !mapProjectIds.has(p.id));
          if (missingProjects.length > 0) {
            console.log('Planned projects missing from map query:', missingProjects);
            console.log('Missing project details:');
            missingProjects.forEach(p => {
              console.log(`- "${p.name}" (ID: ${p.id}) - Address: ${p.address || 'NO ADDRESS'}`);
            });
          }
        }

        const projectsData: ProjectLocation[] = data?.map(project => ({
          id: project.id,
          name: project.name,
          address: project.address || '',
          client_name: (project.clients && typeof project.clients === 'object' && 'name' in project.clients) 
            ? String(project.clients.name)
            : 'Unknown Client',
          status: project.status,
          total_amount: project.budget || 0,
          start_date: project.start_date,
          // Use pre-calculated coordinates if available
          coordinates: project.latitude && project.longitude 
            ? [project.longitude, project.latitude] as [number, number]
            : undefined,
          // Calculate profit margin (20% for demo - in real app this would come from DB)
          profit_margin: 20,
        })).filter(project => project.address) || [];

        console.log('Projects with addresses:', projectsData.length);
        console.log('Planned projects with addresses:', projectsData.filter(p => p.status === 'planned').length);

        // Find any planned projects missing coordinates
        const plannedMissingCoords = data?.filter(p => 
          p.status === 'planned' && 
          p.address && 
          (!p.latitude || !p.longitude)
        );
        if (plannedMissingCoords?.length > 0) {
          console.warn('Planned projects missing coordinates:', plannedMissingCoords);
        }

        setProjects(projectsData);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError('Failed to load projects');
      }
    };

    fetchProjects();

    // Set up realtime subscription
    if (!selectedOrg?.id) return;
    
    const channel = supabase
      .channel('projects-map-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `organization_id=eq.${selectedOrg.id}`
        },
        async (payload) => {
          console.log('Realtime project change:', payload);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            // New project added - fetch its full data including client info
            const { data } = await supabase
              .from('projects')
              .select(`
                id,
                name,
                status,
                budget,
                start_date,
                client_id,
                address,
                city,
                state,
                zip_code,
                latitude,
                longitude,
                clients(
                  name
                )
              `)
              .eq('id', payload.new.id)
              .single();
              
            if (data && data.address) {
              const newProject: ProjectLocation = {
                id: data.id,
                name: data.name,
                address: data.address || '',
                client_name: (data.clients && typeof data.clients === 'object' && 'name' in data.clients) 
                  ? String(data.clients.name)
                  : 'Unknown Client',
                status: data.status,
                total_amount: data.budget || 0,
                start_date: data.start_date,
                coordinates: data.latitude && data.longitude 
                  ? [data.longitude, data.latitude] as [number, number]
                  : undefined,
                profit_margin: 20,
              };
              
              setProjects(prev => [...prev, newProject]);
              
              // Show notification
              setRealtimeUpdate({ type: 'added', project: newProject.name });
              setTimeout(() => setRealtimeUpdate(null), 3000);
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            // Project updated - update in our list
            setProjects(prev => prev.map(project => {
              if (project.id === payload.new.id) {
                // Show notification
                setRealtimeUpdate({ type: 'updated', project: project.name });
                setTimeout(() => setRealtimeUpdate(null), 3000);
                
                // If address changed and no coordinates, we might need to geocode
                // For now, just update the basic fields
                return {
                  ...project,
                  name: payload.new.name || project.name,
                  status: payload.new.status || project.status,
                  total_amount: payload.new.budget || project.total_amount,
                  address: payload.new.address || project.address,
                  coordinates: payload.new.latitude && payload.new.longitude
                    ? [payload.new.longitude, payload.new.latitude] as [number, number]
                    : project.coordinates
                };
              }
              return project;
            }));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            // Project deleted - remove from list and show notification
            setProjects(prev => {
              const deletedProject = prev.find(p => p.id === payload.old.id);
              if (deletedProject) {
                setRealtimeUpdate({ type: 'deleted', project: deletedProject.name });
                setTimeout(() => setRealtimeUpdate(null), 3000);
              }
              return prev.filter(project => project.id !== payload.old.id);
            });
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrg]);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    
    setIsLoading(true);
    
    // Initialize map centered on US with CartoDB dark tiles
    map.current = new maplibregl.Map({
      container: mapContainer.current,
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
      center: [-98.5795, 39.8283], // Center of US
      zoom: 4,
    });
    
    // Add navigation controls with offset for drawer
    const navControl = new maplibregl.NavigationControl();
    map.current.addControl(navControl, 'top-right');
    
    // Adjust control position when drawer is open
    const controlContainer = document.querySelector('.maplibregl-ctrl-top-right');
    if (controlContainer) {
      (controlContainer as HTMLElement).style.marginRight = '16px';
      (controlContainer as HTMLElement).style.marginTop = '16px';
    }
    
    map.current.on('load', () => {
      setIsLoading(false);
    });
    
    // Property outlines will only be removed when clicking another marker
    // This allows free navigation of the map without losing the property display
    
    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // Empty deps - only run once
  
  // Track if this is the first load
  const isFirstLoad = useRef(true);
  
  // Update markers when projects or filters change
  useEffect(() => {
    if (!map.current || !map.current.loaded() || projects.length === 0) return;

    const updateMarkers = async () => {
      try {

        // Geocode all project addresses using Photon (OpenStreetMap-based, CORS-enabled)
        const geocodePromises = projects.map(async (project) => {
          try {
            // Skip if already has coordinates
            if (project.coordinates) {
              return project;
            }
            
            if (!project.address || project.address.trim() === '') {
              console.warn('Skipping project with empty address:', project.name);
              return project;
            }
            
            const response = await fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(project.address)}&limit=1`
            );
            
            if (!response.ok) {
              console.error(`Geocoding failed for ${project.address}: ${response.status}`);
              return project;
            }
            
            let data;
            try {
              data = await response.json();
            } catch (jsonError) {
              console.error(`Failed to parse geocoding response for ${project.address}:`, jsonError);
              return project;
            }
            
            if (data.features && data.features.length > 0) {
              const coordinates = data.features[0].geometry.coordinates;
              return {
                ...project,
                coordinates: coordinates as [number, number],
              };
            }
            return project;
          } catch (err) {
            console.error(`Failed to geocode ${project.address}:`, err);
            return project;
          }
        });

        const geocodedProjects = await Promise.all(geocodePromises);
        const validProjects = geocodedProjects.filter(p => p.coordinates);

        // Log projects that were filtered out
        const invalidProjects = geocodedProjects.filter(p => !p.coordinates);
        if (invalidProjects.length > 0) {
          console.log('Projects without coordinates:', invalidProjects.map(p => ({
            name: p.name,
            status: p.status,
            address: p.address
          })));
        }

        // Filter projects based on filtered IDs from parent component
        let filteredProjects = validProjects;
        
        if (filteredProjectIds && filteredProjectIds.length > 0) {
          // Use the filtered IDs from parent component (includes all filters)
          const idSet = new Set(filteredProjectIds);
          filteredProjects = validProjects.filter(p => idSet.has(p.id));
        } else {
          // Fallback to status filter only (for backward compatibility)
          filteredProjects = selectedStatus === 'all' 
            ? validProjects 
            : validProjects.filter(p => p.status === selectedStatus);
        }

        // Log filtered projects for debugging
        console.log(`Filtered ${selectedStatus} projects:`, filteredProjects.length);
        console.log('Project details:', filteredProjects.map(p => ({
          name: p.name,
          status: p.status,
          coordinates: p.coordinates
        })));

        // Check for duplicate coordinates
        const coordinateMap = new Map<string, number>();
        filteredProjects.forEach(project => {
          if (project.coordinates) {
            const key = `${project.coordinates[0]},${project.coordinates[1]}`;
            coordinateMap.set(key, (coordinateMap.get(key) || 0) + 1);
          }
        });
        
        // Log any duplicate coordinates
        coordinateMap.forEach((count, coords) => {
          if (count > 1) {
            console.warn(`Found ${count} projects at coordinates: ${coords}`);
          }
        });

        // Function to add markers
        const addMarkers = () => {
          // Clear existing markers and any lingering popups before adding new ones
          markers.current.forEach(marker => {
            marker.remove();
          });
          markers.current = [];
          
          // Remove any lingering popups
          document.querySelectorAll('.maplibregl-popup').forEach(popup => popup.remove());

          // Group projects by coordinates to handle overlapping markers
          const projectsByCoords = new Map<string, typeof filteredProjects>();
          
          filteredProjects.forEach((project) => {
            if (!project.coordinates || !map.current) return;
            
            const coordKey = `${project.coordinates[0]},${project.coordinates[1]}`;
            if (!projectsByCoords.has(coordKey)) {
              projectsByCoords.set(coordKey, []);
            }
            projectsByCoords.get(coordKey)!.push(project);
          });
          
          // Log any overlapping projects
          projectsByCoords.forEach((projects) => {
            if (projects.length > 1) {
              console.log(`${projects.length} projects at same location:`, projects.map(p => p.name));
            }
          });

          // Create markers for each unique coordinate
          projectsByCoords.forEach((projectsAtLocation, coordsStr) => {
            const [lng, lat] = coordsStr.split(',').map(Number);
            const coordinates: [number, number] = [lng, lat];
            
            if (projectsAtLocation.length === 1) {
              // Single project - create normal marker
              const project = projectsAtLocation[0];
              const marker = new maplibregl.Marker({ 
                color: getStatusColor(project.status)
              })
                .setLngLat(coordinates)
                .addTo(map.current!);

              // Create popup for hover info
              const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                offset: 25,
                className: 'project-popup'
              });

              // Add hover handlers
              const markerElement = marker.getElement();
              
              markerElement.addEventListener('mouseenter', () => {
                let popupContent = '';
                
                // Show current project info on hover
                popupContent = `
                  <div style="padding: 8px; min-width: 200px;">
                    <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #fff;">
                      ${project.name}
                    </h4>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #ccc;">
                      ${project.client_name}
                    </p>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                      <span style="font-size: 12px; color: #888;">
                        ${formatCurrency(project.total_amount)}
                      </span>
                      <span style="width: 4px; height: 4px; background: #666; border-radius: 50%;"></span>
                      <span style="font-size: 12px; color: #10b981;">
                        ${project.profit_margin || 20}% margin
                      </span>
                      <span style="width: 4px; height: 4px; background: #666; border-radius: 50%;"></span>
                      <span style="
                        font-size: 11px; 
                        padding: 2px 6px; 
                        background: ${getStatusColor(project.status)}20; 
                        color: ${getStatusColor(project.status)};
                        border-radius: 4px;
                        font-weight: 500;
                      ">
                        ${getStatusLabel(project.status)}
                      </span>
                    </div>
                    ${projectsAtLocation.length > 1 ? `
                      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; font-size: 11px; color: #888;">
                        +${projectsAtLocation.length - 1} more project${projectsAtLocation.length > 2 ? 's' : ''} at this location
                      </div>
                    ` : ''}
                  </div>
                `;
                
                popup.setLngLat(coordinates)
                  .setHTML(popupContent)
                  .addTo(map.current!);
              });

              markerElement.addEventListener('mouseleave', () => {
                popup.remove();
              });

              // Add click handler to zoom in and show details
              markerElement.addEventListener('click', () => {
                popup.remove(); // Remove popup when clicking
                
                // Remove previous property outline if it exists
                if (map.current && map.current.getLayer(buildingLayerId.current)) {
                  map.current.removeLayer(buildingLayerId.current);
                  map.current.removeLayer(buildingLayerId.current + '-outline');
                  map.current.removeSource('building-source');
                }
                
                setSelectedProject(project); // Show current project details
                
                if (map.current && coordinates) {
                  // Zoom in and center on the clicked marker
                  map.current.flyTo({
                    center: coordinates,
                    zoom: 18, // Closer zoom for building detail
                    duration: 1500, // Animation duration in milliseconds
                    essential: true
                  });
                  
                  // Fetch building footprint
                  fetchBuildingFootprint(coordinates[1], coordinates[0]);
                  
                  // Make marker draggable at high zoom for precise positioning
                  marker.setDraggable(true);
                  
                  // Handle drag end to save new position
                  marker.on('dragend', () => {
                    const newPosition = marker.getLngLat();
                    console.log('Marker moved to:', newPosition);
                    // TODO: Save new coordinates to database
                    // await updateProjectCoordinates(project.id, newPosition.lng, newPosition.lat);
                  });
                }
              });

              markers.current.push(marker);
            } else {
              // Multiple projects - create clustered marker
              // Use the most common status color, or first project's status
              const statusCounts = projectsAtLocation.reduce((acc, p) => {
                acc[p.status] = (acc[p.status] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              const dominantStatus = Object.entries(statusCounts)
                .sort(([,a], [,b]) => b - a)[0][0];
              
              // Create custom marker element with count badge
              const el = document.createElement('div');
              el.className = 'cluster-marker';
              el.style.width = '40px';
              el.style.height = '40px';
              el.style.position = 'relative';
              el.style.cursor = 'pointer';
              
              // Create pin
              const pin = document.createElement('div');
              pin.style.width = '30px';
              pin.style.height = '30px';
              pin.style.backgroundColor = getStatusColor(dominantStatus);
              pin.style.borderRadius = '50% 50% 50% 0';
              pin.style.transform = 'rotate(-45deg)';
              pin.style.position = 'absolute';
              pin.style.left = '5px';
              pin.style.top = '5px';
              
              // Create count badge
              const badge = document.createElement('div');
              badge.textContent = String(projectsAtLocation.length);
              badge.style.position = 'absolute';
              badge.style.top = '8px';
              badge.style.left = '50%';
              badge.style.transform = 'translateX(-50%)';
              badge.style.backgroundColor = '#000';
              badge.style.color = '#fff';
              badge.style.borderRadius = '10px';
              badge.style.padding = '2px 6px';
              badge.style.fontSize = '11px';
              badge.style.fontWeight = 'bold';
              badge.style.minWidth = '20px';
              badge.style.textAlign = 'center';
              badge.style.border = '2px solid ' + getStatusColor(dominantStatus);
              
              el.appendChild(pin);
              el.appendChild(badge);
              
              const marker = new maplibregl.Marker({ element: el })
                .setLngLat(coordinates)
                .addTo(map.current!);

              // Create popup for hover info showing all projects
              const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                offset: 25,
                className: 'project-popup'
              });

              // Store popup reference on the element to ensure proper cleanup
              let currentPopup: maplibregl.Popup | null = null;
              
              // Add hover handlers
              el.addEventListener('mouseenter', () => {
                // Remove any existing popup first
                if (currentPopup) {
                  currentPopup.remove();
                  currentPopup = null;
                }
                
                const popupContent = `
                  <div style="padding: 8px; min-width: 200px; max-height: 300px; overflow-y: auto;">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #fff;">
                      ${projectsAtLocation.length} Projects at this location
                    </h4>
                    ${projectsAtLocation.map((p, idx) => `
                      <div style="${idx > 0 ? 'margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;' : ''}">
                        <div style="font-size: 13px; color: #fff; margin-bottom: 2px;">${p.name}</div>
                        <div style="font-size: 11px; color: #ccc; margin-bottom: 4px;">${p.client_name}</div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span style="font-size: 11px; color: #888;">${formatCurrency(p.total_amount)}</span>
                          <span style="
                            font-size: 10px; 
                            padding: 1px 4px; 
                            background: ${getStatusColor(p.status)}20; 
                            color: ${getStatusColor(p.status)};
                            border-radius: 3px;
                          ">
                            ${getStatusLabel(p.status)}
                          </span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `;
                
                currentPopup = popup;
                popup.setLngLat(coordinates)
                  .setHTML(popupContent)
                  .addTo(map.current!);
              });

              el.addEventListener('mouseleave', () => {
                if (currentPopup) {
                  currentPopup.remove();
                  currentPopup = null;
                }
              });

              // Click handler - zoom in to see individual projects
              el.addEventListener('click', () => {
                if (currentPopup) {
                  currentPopup.remove();
                  currentPopup = null;
                }
                
                if (map.current) {
                  // Remove previous property outline if it exists
                  if (map.current.getLayer(buildingLayerId.current)) {
                    map.current.removeLayer(buildingLayerId.current);
                    map.current.removeLayer(buildingLayerId.current + '-outline');
                    map.current.removeSource('building-source');
                  }
                  
                  // Zoom in to separate the markers
                  map.current.flyTo({
                    center: coordinates,
                    zoom: 18, // Very close zoom to potentially separate markers
                    duration: 1500,
                    essential: true
                  });
                  
                  // Show the first project in the drawer
                  setSelectedProject(projectsAtLocation[0]);
                  
                  // Fetch building footprint
                  fetchBuildingFootprint(coordinates[1], coordinates[0]);
                }
              });

              markers.current.push(marker);
            }
          });

          // Fit bounds only on first load to show all projects
          if (filteredProjects.length > 0 && isFirstLoad.current) {
            const bounds = new maplibregl.LngLatBounds();
            filteredProjects.forEach(project => {
              if (project.coordinates) {
                bounds.extend(project.coordinates);
              }
            });
            
            // Check if projects are spread across multiple regions
            const lats = filteredProjects.map(p => p.coordinates?.[1]).filter(Boolean) as number[];
            const lngs = filteredProjects.map(p => p.coordinates?.[0]).filter(Boolean) as number[];
            const latSpread = Math.max(...lats) - Math.min(...lats);
            const lngSpread = Math.max(...lngs) - Math.min(...lngs);
            
            // If projects span a large area (multiple states/territories), use lower zoom
            if (latSpread > 10 || lngSpread > 15) {
              map.current!.fitBounds(bounds, { padding: 100, maxZoom: 6 });
            } else {
              map.current!.fitBounds(bounds, { padding: 50 });
            }
            
            isFirstLoad.current = false;
          }
          
          // Update the project count display to show the actual filtered count
          console.log(`Status: ${selectedStatus}, Showing ${filteredProjects.length} markers on map`);
        };

        // Add markers immediately since map is already loaded
        addMarkers();
      } catch (err) {
        console.error('Marker update error:', err);
      }
    };

    updateMarkers();

  }, [projects, selectedStatus, filteredProjectIds]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return '#a855f7'; // purple
      case 'active':
        return '#10b981'; // green
      case 'on-hold':
        return '#f59e0b'; // yellow
      case 'completed':
        return '#3b82f6'; // blue
      case 'cancelled':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
  };

  // Fetch building footprint from OpenStreetMap
  const fetchBuildingFootprint = async (lat: number, lng: number) => {
    setPropertyData({ loading: true });
    
    console.log('Fetching building data for:', lat, lng);
    
    try {
      // Query Overpass API for buildings near the coordinates
      // Increase search radius to 100m and include relations
      const overpassQuery = `
        [out:json][timeout:15];
        (
          way["building"](around:100,${lat},${lng});
          relation["building"](around:100,${lat},${lng});
        );
        out geom;
      `;
      
      console.log('Overpass query:', overpassQuery);
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch building data');
      }
      
      const data = await response.json();
      console.log('OSM Response:', data);
      
      if (data.elements && data.elements.length > 0) {
        // Get the closest building
        const building = data.elements[0];
        
        // Convert OSM geometry to GeoJSON
        const coordinates = building.geometry.map((node: any) => [node.lon, node.lat]);
        coordinates.push(coordinates[0]); // Close the polygon
        
        const geojson = {
          type: 'Feature' as const,
          properties: {
            ...building.tags,
            id: building.id
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [coordinates]
          }
        };
        
        // Calculate area using Turf-like formula (simplified)
        const area = calculatePolygonArea(coordinates);
        
        // Calculate centroid of the building for more accurate marker placement
        const centroid = calculatePolygonCentroid(coordinates);
        
        setPropertyData({
          building: geojson,
          area: area,
          loading: false,
          centroid: centroid
        });
        
        // Add building footprint to map
        if (map.current) {
          // Remove existing building layer if any
          if (map.current.getLayer(buildingLayerId.current)) {
            map.current.removeLayer(buildingLayerId.current);
            map.current.removeSource('building-source');
          }
          
          // Add new building footprint
          map.current.addSource('building-source', {
            type: 'geojson',
            data: geojson
          });
          
          map.current.addLayer({
            id: buildingLayerId.current,
            type: 'fill',
            source: 'building-source',
            paint: {
              'fill-color': '#336699',
              'fill-opacity': 0.3,
              'fill-outline-color': '#336699'
            }
          });
          
          // Add outline
          map.current.addLayer({
            id: buildingLayerId.current + '-outline',
            type: 'line',
            source: 'building-source',
            paint: {
              'line-color': '#336699',
              'line-width': 2
            }
          });
          
          // Removed centroid marker - keeping property outline only
        }
      } else {
        console.log('No buildings found in OSM data');
        
        // Try alternative: Create approximate property boundary based on typical lot size
        // This is a fallback when no building data exists
        const typicalLotSize = 0.00015; // Approximately 50ft in degrees at mid-latitudes
        
        // Create a simple square lot around the coordinates
        const boundaryCoords = [
          [lng - typicalLotSize, lat - typicalLotSize],
          [lng + typicalLotSize, lat - typicalLotSize],
          [lng + typicalLotSize, lat + typicalLotSize],
          [lng - typicalLotSize, lat + typicalLotSize],
          [lng - typicalLotSize, lat - typicalLotSize] // Close the polygon
        ];
        
        const approximateLot = {
          type: 'Feature' as const,
          properties: {
            type: 'approximate_lot',
            note: 'Estimated property boundary'
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [boundaryCoords]
          }
        };
        
        // Add approximate lot to map with different styling
        if (map.current) {
          // Remove existing building layer if any
          if (map.current.getLayer(buildingLayerId.current)) {
            map.current.removeLayer(buildingLayerId.current);
            map.current.removeLayer(buildingLayerId.current + '-outline');
            map.current.removeSource('building-source');
          }
          
          // Add approximate lot
          map.current.addSource('building-source', {
            type: 'geojson',
            data: approximateLot
          });
          
          map.current.addLayer({
            id: buildingLayerId.current,
            type: 'fill',
            source: 'building-source',
            paint: {
              'fill-color': '#336699',
              'fill-opacity': 0.1,
              'fill-outline-color': '#336699'
            }
          });
          
          // Add outline with dashed line
          map.current.addLayer({
            id: buildingLayerId.current + '-outline',
            type: 'line',
            source: 'building-source',
            paint: {
              'line-color': '#336699',
              'line-width': 2,
              'line-dasharray': [2, 2]
            }
          });
        }
        
        setPropertyData({ 
          building: approximateLot, 
          area: 2500, // Approximate 50x50 ft lot
          loading: false,
          isApproximate: true
        });
      }
    } catch (error) {
      console.error('Error fetching building footprint:', error);
      setPropertyData({ 
        building: null, 
        area: 0,
        loading: false 
      });
    }
  };
  
  // Simple area calculation for polygon (in square feet)
  const calculatePolygonArea = (coordinates: number[][]) => {
    let area = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [x1, y1] = coordinates[i];
      const [x2, y2] = coordinates[i + 1];
      
      // Convert to approximate feet (very rough approximation)
      const x1Feet = x1 * 364000; // Rough conversion at mid-latitudes
      const y1Feet = y1 * 364000;
      const x2Feet = x2 * 364000;
      const y2Feet = y2 * 364000;
      
      area += (x1Feet * y2Feet) - (x2Feet * y1Feet);
    }
    return Math.abs(area / 2);
  };
  
  // Calculate centroid of polygon
  const calculatePolygonCentroid = (coordinates: number[][]): [number, number] => {
    let x = 0;
    let y = 0;
    const numPoints = coordinates.length - 1; // Exclude the closing point
    
    for (let i = 0; i < numPoints; i++) {
      x += coordinates[i][0];
      y += coordinates[i][1];
    }
    
    return [x / numPoints, y / numPoints];
  };

  return (
    <div className="relative h-full w-full bg-[#0a0a0a] rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
          <Loader className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      )}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center p-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Error Loading Map</h3>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        </div>
      ) : (
        <>
          <div ref={mapContainer} className="w-full h-full" />
          
          {/* Realtime Update Notification */}
          {realtimeUpdate && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
              <div className={`bg-[#1E1E1E] border rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 ${
                realtimeUpdate.type === 'added' ? 'border-green-500' :
                realtimeUpdate.type === 'updated' ? 'border-blue-500' :
                'border-red-500'
              }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  realtimeUpdate.type === 'added' ? 'bg-green-500' :
                  realtimeUpdate.type === 'updated' ? 'bg-blue-500' :
                  'bg-red-500'
                }`} />
                <span className="text-sm text-white">
                  Project "{realtimeUpdate.project}" {realtimeUpdate.type}
                </span>
              </div>
            </div>
          )}

          {/* Project Count Badge */}
          <div className="absolute top-4 left-4 bg-[#1E1E1E] border border-[#333] rounded-lg px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#5b8fc7]" />
              <span className="text-sm text-white font-medium">
                {(() => {
                  if (filteredProjectIds) {
                    // Show count based on filtered IDs
                    const idSet = new Set(filteredProjectIds);
                    const count = projects.filter(p => idSet.has(p.id)).length;
                    return `${count} ${count === 1 ? 'Project' : 'Projects'}`;
                  } else {
                    // Fallback to status-based count
                    const count = selectedStatus === 'all' 
                      ? projects.length 
                      : projects.filter(p => p.status === selectedStatus).length;
                    return `${count} ${count === 1 ? 'Project' : 'Projects'}`;
                  }
                })()}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-[#1E1E1E] border border-[#333] rounded-lg p-3 shadow-lg z-10">
            <h4 className="text-xs font-medium text-gray-400 mb-2 uppercase">Project Status</h4>
            <div className="space-y-1">
              {['planned', 'active', 'on-hold', 'completed', 'cancelled'].map(status => (
                <div key={status} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getStatusColor(status) }}
                  />
                  <span className="text-xs text-gray-300">{getStatusLabel(status)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Project Details Drawer - Slides from right */}
          <div className={`fixed top-0 right-0 h-full w-96 bg-[#1E1E1E] border-l border-[#333] shadow-2xl transform transition-transform duration-300 z-[9999] ${
            selectedProject ? 'translate-x-0' : 'translate-x-full'
          }`}>
            {selectedProject && (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-[#333]">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1">{selectedProject.name}</h2>
                      <p className="text-sm text-gray-400">{selectedProject.client_name}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedProject(null);
                        setPropertyData(null);
                        // Keep property outline visible - it will be removed when clicking elsewhere
                      }}
                      className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#333] transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                  {/* Status */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Status</h3>
                    <span 
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{ 
                        backgroundColor: getStatusColor(selectedProject.status) + '20',
                        color: getStatusColor(selectedProject.status)
                      }}
                    >
                      {getStatusLabel(selectedProject.status)}
                    </span>
                  </div>

                  {/* Location */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Location</h3>
                    <div className="flex items-start gap-2 text-gray-300">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{selectedProject.address}</span>
                    </div>
                  </div>

                  {/* Financials */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Financials</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-300">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm">Budget</span>
                        </div>
                        <span className="text-sm font-medium text-white">{formatCurrency(selectedProject.total_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-sm font-bold">%</span>
                          <span className="text-sm">Profit Margin</span>
                        </div>
                        <span className="text-sm font-medium text-green-400">{selectedProject.profit_margin || 20}%</span>
                      </div>
                      <div className="pt-2 border-t border-[#333]">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">Estimated Profit</span>
                          <span className="text-sm font-medium text-green-400">
                            {formatCurrency(selectedProject.total_amount * ((selectedProject.profit_margin || 20) / 100))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Timeline</h3>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">Start Date: {new Date(selectedProject.start_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  {/* Property Intelligence */}
                  {propertyData && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Property Intelligence</h3>
                      {propertyData.loading ? (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Loading property data...</span>
                        </div>
                      ) : propertyData.building ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-300">
                              {propertyData.isApproximate ? 'Approximate property boundary' : 'Building footprint detected'}
                            </span>
                          </div>
                          {propertyData.area && propertyData.area > 0 && (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-gray-300">
                                <Ruler className="w-4 h-4" />
                                <span className="text-sm">
                                  {propertyData.isApproximate ? 'Est. Lot Size' : 'Approx. Area'}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-white">
                                {Math.round(propertyData.area).toLocaleString()} sq ft
                              </span>
                            </div>
                          )}
                          {!propertyData.isApproximate && propertyData.building.properties?.levels && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-300">Floors</span>
                              <span className="text-sm font-medium text-white">
                                {propertyData.building.properties.levels}
                              </span>
                            </div>
                          )}
                          {!propertyData.isApproximate && propertyData.building.properties?.['building:material'] && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-300">Material</span>
                              <span className="text-sm font-medium text-white">
                                {propertyData.building.properties['building:material']}
                              </span>
                            </div>
                          )}
                          <div className="pt-2 border-t border-[#333]">
                            <p className="text-xs text-gray-500">
                              {propertyData.isApproximate 
                                ? 'Estimated boundary shown. Actual property lines may differ.'
                                : 'Data from OpenStreetMap. Verify measurements on-site.'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          No building data available for this location
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-[#333]">
                  <button
                    onClick={() => navigate(`/projects/${selectedProject.id}`)}
                    className="w-full px-4 py-3 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2A5580] transition-colors"
                  >
                    View Full Project Details
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Overlay to close drawer when clicking outside */}
          {selectedProject && (
            <div 
              className="fixed inset-0 bg-black/20 z-[9998]"
              onClick={() => {
                setSelectedProject(null);
                setPropertyData(null);
                // Remove building footprint from map
                if (map.current) {
                  if (map.current.getLayer(buildingLayerId.current)) {
                    map.current.removeLayer(buildingLayerId.current);
                    map.current.removeLayer(buildingLayerId.current + '-outline');
                    map.current.removeSource('building-source');
                  }
                }
              }}
            />
          )}

        </>
      )}
    </div>
  );
};