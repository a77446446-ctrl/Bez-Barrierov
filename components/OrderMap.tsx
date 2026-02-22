import React, { useRef, useState, useEffect } from 'react';
import { Order, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default Leaflet markers (if not already handled globally)
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const MapInvalidator = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

const OrderMap = ({ order, hideInfo = false }: { order: Order; hideInfo?: boolean }) => {
  const { user } = useAuth();
  const [routePositions, setRoutePositions] = useState<any[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);

  // Custom icons
  const iconA = L.divIcon({
    className: 'custom-marker-icon marker-a',
    html: 'A',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  const iconB = L.divIcon({
    className: 'custom-marker-icon marker-b',
    html: 'B',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  useEffect(() => {
    if (order.locationFrom && order.locationTo) {
      // OSRM routing
      fetch(`https://router.project-osrm.org/route/v1/driving/${order.locationFrom.lng},${order.locationFrom.lat};${order.locationTo.lng},${order.locationTo.lat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            // OSRM returns coordinates as [lon, lat], Leaflet needs [lat, lon]
            const coordinates = route.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
            setRoutePositions(coordinates);
            setRouteDistance(route.distance / 1000); // distance in meters -> km
          }
        })
        .catch(err => {
          console.error('Routing error:', err);
          // Fallback to straight line
          setRoutePositions([
            [order.locationFrom!.lat, order.locationFrom!.lng],
            [order.locationTo!.lat, order.locationTo!.lng]
          ]);
          const dist = getDistanceFromLatLonInKm(
            order.locationFrom!.lat, order.locationFrom!.lng,
            order.locationTo!.lat, order.locationTo!.lng
          );
          setRouteDistance(dist);
        });
    } else {
      setRoutePositions([]);
      setRouteDistance(null);
    }
  }, [order]);

  function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);
    var dLon = deg2rad(lon2-lon1); 
    var a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d;
  }

  function deg2rad(deg: number) {
    return deg * (Math.PI/180)
  }

  if (order.locationFrom && order.locationTo) {
    return (
      <div className="w-full animate-in fade-in duration-300">
         <div className="h-64 w-full rounded-xl overflow-hidden mt-4 border border-gray-200 z-0 relative">
                <MapContainer 
                    center={[order.locationFrom.lat, order.locationFrom.lng]} 
                    zoom={10}
                    style={{ width: '100%', height: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        keepBuffer={4}
                    />
                    <MapInvalidator />
                    
                    <Marker position={[order.locationFrom.lat, order.locationFrom.lng]} icon={iconA}>
                        <Popup>
                            <strong>Точка А</strong>{hideInfo ? '' : `: ${order.locationFrom.address}`}
                        </Popup>
                    </Marker>
                    
                    <Marker position={[order.locationTo.lat, order.locationTo.lng]} icon={iconB}>
                        <Popup>
                            <strong>Точка Б</strong>{hideInfo ? '' : `: ${order.locationTo.address}`}
                        </Popup>
                    </Marker>

                    {routePositions.length > 0 && (
                        <Polyline 
                            positions={routePositions}
                            color="#004F32"
                            weight={5}
                            opacity={0.7}
                        />
                    )}
                </MapContainer>

              {/* Distance Banner */}
              {routeDistance !== null && (
                  <div className="absolute bottom-4 right-2 z-[1000] bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
                      <div className="bg-green-100 p-2 rounded-full text-careem-primary">
                          <i className="fas fa-route"></i>
                      </div>
                      <div>
                          <div className="text-xs text-gray-500 font-medium">Расстояние</div>
                          <div className="text-lg font-bold text-gray-900">{routeDistance.toFixed(1)} км</div>
                      </div>
                  </div>
              )}
         </div>
         {!hideInfo && user?.role !== UserRole.EXECUTOR && (
         <div className="mt-4 bg-white p-5 rounded-2xl shadow-lg border border-gray-100 relative overflow-hidden">
              <div className="flex flex-col gap-6 relative">
                  {/* Vertical connecting line */}
                  <div className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-careem-primary to-red-600 hidden sm:block opacity-20"></div>

                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0 border-2 border-careem-primary shadow-sm">
                      <span className="font-bold text-careem-primary">A</span> 
                    </div>
                    <div className="flex-1 pt-1">
                       <p className="text-xs font-bold text-careem-primary uppercase tracking-wider mb-1">
                          {order.serviceType === 'Транспортировка на авто' ? 'Точка отправления' : 'Адрес А'}
                       </p>
                       <p className="text-gray-900 font-medium leading-relaxed">
                          {order.serviceType === 'Транспортировка на авто' && <span className="font-semibold text-careem-primary mr-1">Точка А:</span>}
                          {order.locationFrom.address || 'Точка отправления'}
                       </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 border-2 border-red-600 shadow-sm">
                      <span className="font-bold text-red-600">B</span>
                    </div>
                    <div className="flex-1 pt-1">
                       <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">
                          {order.serviceType === 'Транспортировка на авто' ? 'Точка назначения' : 'Адрес Б'}
                       </p>
                       <p className="text-gray-900 font-medium leading-relaxed">
                          {order.serviceType === 'Транспортировка на авто' && <span className="font-semibold text-red-600 mr-1">Точка Б:</span>}
                          {order.locationTo.address || 'Точка назначения'}
                       </p>
                    </div>
                  </div>
              </div>
          </div>
          )}
       </div>
    );
  } else if (order.generalLocation) {
      return (
       <div className="w-full animate-in fade-in duration-300">
         <div className="h-64 w-full rounded-xl overflow-hidden mt-4 border border-gray-200 z-0 relative">
                <MapContainer 
                    center={[order.generalLocation.lat, order.generalLocation.lng]} 
                    zoom={15}
                    style={{ width: '100%', height: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        keepBuffer={4}
                    />
                    <MapInvalidator />
                    <Marker position={[order.generalLocation.lat, order.generalLocation.lng]}>
                         <Popup>{hideInfo ? 'Место встречи' : `Место встречи: ${order.generalLocation.address}`}</Popup>
                    </Marker>
                </MapContainer>
         </div>
         {!hideInfo && (
           <div className="mt-3 bg-gray-50 p-3 rounded-lg text-sm text-gray-700 flex items-start gap-2 border border-gray-100">
                <i className="fas fa-map-marker-alt text-red-500 mt-1 shrink-0"></i>
                <span>{order.generalLocation.address || 'Место встречи'}</span>
            </div>
         )}
       </div>
     );
  }
  return null;
};

export default OrderMap;
