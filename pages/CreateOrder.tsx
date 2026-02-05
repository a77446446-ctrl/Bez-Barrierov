import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SERVICE_TYPES, MOCK_USERS, MOCK_ORDERS } from '../constants';
import { UserRole, OrderStatus, Order, Location } from '../types';
import { toast } from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import ErrorBoundary from '../components/ErrorBoundary';
import AddressAutocomplete from '../components/AddressAutocomplete';

// Fix for default Leaflet markers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
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

const MapController = ({ center }: { center: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15);
    }
  }, [center]);
  return null;
};

// Helper component to handle map clicks
const MapEvents = ({ 
  serviceId, 
  activeInput, 
  setActiveInput, 
  updateLocation, 
  setLocationFrom, 
  setLocationTo, 
  setGeneralLocation 
}: any) => {
  useMapEvents({
    click(e) {
      const coords = [e.latlng.lat, e.latlng.lng];
      
      if (serviceId === '3') {
        if (activeInput === 'from') {
             updateLocation(coords, setLocationFrom);
             setActiveInput('to');
        } else {
             updateLocation(coords, setLocationTo);
        }
      } else {
        updateLocation(coords, setGeneralLocation);
      }
    },
  });
  return null;
};

const UnifiedMapPicker = ({
  serviceId,
  locationFrom,
  locationTo,
  generalLocation,
  setLocationFrom,
  setLocationTo,
  setGeneralLocation
}: {
  serviceId: string;
  locationFrom?: Location;
  locationTo?: Location;
  generalLocation?: Location;
  setLocationFrom: (loc: Location) => void;
  setLocationTo: (loc: Location) => void;
  setGeneralLocation: (loc: Location) => void;
}) => {
  const [activeInput, setActiveInput] = useState<'from' | 'to'>('from');
  const [routePositions, setRoutePositions] = useState<any[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);

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
  
  // Calculate distance when both points are present
  useEffect(() => {
    if (serviceId === '3' && locationFrom && locationTo) {
         // OSRM routing
         fetch(`https://router.project-osrm.org/route/v1/driving/${locationFrom.lng},${locationFrom.lat};${locationTo.lng},${locationTo.lat}?overview=full&geometries=geojson`)
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
               [locationFrom.lat, locationFrom.lng],
               [locationTo.lat, locationTo.lng]
             ]);
             const dist = getDistanceFromLatLonInKm(
               locationFrom.lat, locationFrom.lng,
               locationTo.lat, locationTo.lng
             );
             setRouteDistance(dist);
           });
    } else {
      setRoutePositions([]);
      setRouteDistance(null);
    }
  }, [locationFrom, locationTo, serviceId]);

  const updateLocation = (coords: number[], setter: (loc: Location) => void) => {
      const [lat, lng] = coords;
      setter({ lat, lng, address: 'Определение адреса...' });
      
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.display_name) {
                setter({ lat, lng, address: data.display_name });
            } else {
                setter({ lat, lng, address: 'Адрес не найден' });
            }
        })
        .catch(err => {
            console.error('Ошибка геокодирования:', err);
            setter({ lat, lng, address: 'Ошибка' });
        });
  };

  return (
    <div className="mb-4">
      {/* Controls for Transport Mode */}
      {serviceId === '3' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <AddressAutocomplete
                  label="Откуда (Точка А)"
                  value={locationFrom}
                  onChange={(loc) => {
                      setLocationFrom(loc);
                      setMapCenter([loc.lat, loc.lng]);
                      setActiveInput('to');
                  }}
                  isActive={activeInput === 'from'}
                  onFocus={() => setActiveInput('from')}
                  color="bg-green-500"
                  placeholder="Введите адрес подачи"
              />

              <AddressAutocomplete
                  label="Куда (Точка Б)"
                  value={locationTo}
                  onChange={(loc) => {
                      setLocationTo(loc);
                      setMapCenter([loc.lat, loc.lng]);
                  }}
                  isActive={activeInput === 'to'}
                  onFocus={() => setActiveInput('to')}
                  color="bg-red-500"
                  placeholder="Введите адрес назначения"
              />
          </div>
      )}

      {/* Controls for General Mode */}
      {serviceId !== '3' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Место встречи <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
                Укажите примерный район или место встречи. Точный адрес (квартира, подъезд) вы сможете сообщить помощнику лично.
            </p>
            <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <i className={`fas ${generalLocation ? 'fa-map-marker-alt text-careem-primary' : 'fa-search text-gray-400'}`}></i>
                </div>
                <input 
                    type="text" 
                    value={generalLocation?.address || ''}
                    readOnly
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-careem-primary focus:ring-careem-primary sm:text-sm py-2 bg-gray-50 text-gray-900"
                    placeholder="Нажмите на карту для выбора места" 
                />
            </div>
          </div>
      )}

      {/* Unified Map Instance - Never Unmounts */}
      <div className="h-96 rounded-xl overflow-hidden border border-gray-300 relative z-0">
        <ErrorBoundary fallback={<div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-500">Ошибка загрузки карты</div>}>
            <MapContainer 
                center={[55.75, 37.61]}
                zoom={10} 
                style={{ width: '100%', height: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    keepBuffer={4}
                />
                <MapInvalidator />
                <MapController center={mapCenter} />
                
                <MapEvents 
                   serviceId={serviceId}
                   activeInput={activeInput}
                   setActiveInput={setActiveInput}
                   updateLocation={updateLocation}
                   setLocationFrom={setLocationFrom}
                   setLocationTo={setLocationTo}
                   setGeneralLocation={setGeneralLocation}
                />

                {/* Transport Mode Placemarks */}
                {serviceId === '3' && locationFrom && (
                    <Marker position={[locationFrom.lat, locationFrom.lng]} icon={iconA}>
                        <Popup>Точка А: {locationFrom.address}</Popup>
                    </Marker>
                )}
                {serviceId === '3' && locationTo && (
                    <Marker position={[locationTo.lat, locationTo.lng]} icon={iconB}>
                         <Popup>Точка Б: {locationTo.address}</Popup>
                    </Marker>
                )}
                
                {/* Route Line */}
                {serviceId === '3' && routePositions.length > 0 && (
                     <Polyline 
                        positions={routePositions}
                        color="#004F32"
                        weight={5}
                        opacity={0.7}
                     />
                )}

                {/* General Mode Placemark */}
                {serviceId !== '3' && generalLocation && (
                    <Marker position={[generalLocation.lat, generalLocation.lng]}>
                        <Popup>Место встречи</Popup>
                    </Marker>
                )}
            </MapContainer>
        </ErrorBoundary>

        {/* Distance Banner */}
        {serviceId === '3' && routeDistance !== null && (
            <div className="absolute bottom-4 right-4 z-[1000] bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
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
      
      <p className="text-xs text-gray-500 mt-2 text-center">
         {serviceId === '3' 
            ? '* Нажмите на поле "Откуда" или "Куда", затем кликните по карте.' 
            : '* Выберите точку встречи на карте.'}
      </p>
    </div>
  );
};

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
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

const CreateOrder: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedExecutorId = searchParams.get('executorId');

  const [serviceId, setServiceId] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [executorId, setExecutorId] = useState(preselectedExecutorId || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [details, setDetails] = useState('');
  const [allowOpenSelection, setAllowOpenSelection] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executors, setExecutors] = useState<any[]>([]);
  const [locationFrom, setLocationFrom] = useState<Location | undefined>(undefined);
  const [locationTo, setLocationTo] = useState<Location | undefined>(undefined);
  const [generalLocation, setGeneralLocation] = useState<Location | undefined>(undefined);

  useEffect(() => {
    // Load executors
    const storedUsers = localStorage.getItem('bez_barrierov_users');
    const users = storedUsers ? JSON.parse(storedUsers) : MOCK_USERS;
    const validExecutors = users.filter((u: any) => 
      u.role === UserRole.EXECUTOR && 
      u.id !== 'u2' && 
      u.id !== 'u3' &&
      // Hide subscribed executors unless they are subscribed to the current user
      (u.subscriptionStatus !== 'active' || u.subscribedToCustomerId === user?.id)
    );
    
    if (!isLoading && !user) {
      navigate('/auth');
      toast('Пожалуйста, войдите в систему для оформления заказа', { icon: '🔒' });
      return;
    }

    if (preselectedExecutorId) {
      setExecutorId(preselectedExecutorId);
      // Filter to show only the selected executor
      const selected = validExecutors.find((u: any) => u.id === preselectedExecutorId);
      setExecutors(selected ? [selected] : validExecutors);
    } else {
      setExecutors(validExecutors);
    }
  }, [user, isLoading, preselectedExecutorId, navigate]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          setVoiceMessage(reader.result as string);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      toast.error('Не удалось получить доступ к микрофону');
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const clearRecording = () => {
    setVoiceMessage(null);
  };

  const selectedServiceType = SERVICE_TYPES.find(s => s.id === serviceId);
  // Find selected executor name for display
  const selectedExecutor = executors.find(e => e.id === executorId);

  // Update price when service or executor changes
  useEffect(() => {
    if (!selectedServiceType) {
      setPrice(0);
      return;
    }

    if (selectedExecutor) {
      // If executor is selected, check their custom price
      const customService = selectedExecutor.customServices?.find(
        (s: any) => s.serviceId === serviceId && s.enabled
      );
      if (customService) {
        setPrice(customService.price);
      } else {
        setPrice(selectedServiceType.pricePerHour);
      }
    } else {
      // If "Any available specialist" is selected
      // Find the minimum price for this service among all executors
      const allPrices = executors
        .map(ex => {
          const customService = ex.customServices?.find((s: any) => s.serviceId === serviceId && s.enabled);
          return customService ? customService.price : null;
        })
        .filter(p => p !== null && p !== undefined) as number[];

      if (allPrices.length > 0) {
        setPrice(Math.min(...allPrices));
      } else {
        setPrice(selectedServiceType.pricePerHour);
      }
    }
  }, [serviceId, selectedExecutor, executors]);

  // Logic merged into main useEffect

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth?mode=register');
      return;
    }

    if (!serviceId || !date || !time) {
      toast.error('Пожалуйста, заполните все обязательные поля');
      return;
    }

    // Validate location
    if (serviceId === '3') { // Transport
       if (!locationFrom || !locationTo) {
         toast.error('Пожалуйста, укажите точки "Откуда" и "Куда" на карте');
         return;
       }
    } else {
       if (!generalLocation) {
         toast.error('Пожалуйста, укажите место встречи на карте');
         return;
       }
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      const executorName = executors.find(e => e.id === executorId)?.name || 'Исполнитель';
      
      // Create new order
      const newOrder: Order = {
        id: Math.random().toString(36).substr(2, 9),
        customerId: user.id,
        executorId: executorId || undefined,
        serviceType: selectedServiceType?.name || 'Услуга',
        date: date,
        time: time,
        status: executorId ? OrderStatus.PENDING : OrderStatus.OPEN,
        totalPrice: price,
        details: details,
        allowOpenSelection: !!executorId && allowOpenSelection,
        responses: [],
        voiceMessageUrl: voiceMessage || undefined,
        locationFrom: serviceId === '3' ? locationFrom : undefined,
        locationTo: serviceId === '3' ? locationTo : undefined,
        generalLocation: serviceId !== '3' ? generalLocation : undefined
      };

      // Get existing orders from LS or initialize with mocks
      const storedOrders = localStorage.getItem('bez_barrierov_orders');
      const currentOrders: Order[] = storedOrders ? JSON.parse(storedOrders) : MOCK_ORDERS;
      
      // Add new order
      const updatedOrders = [newOrder, ...currentOrders];
      
      // Save to LS
      localStorage.setItem('bez_barrierov_orders', JSON.stringify(updatedOrders));
      window.dispatchEvent(new Event('storage'));
      
      toast.success(`Заказ создан успешно!`);
      navigate('/dashboard');
    }, 1000);
  };

  const calculateTotal = () => {
    if (!selectedServiceType) return 0;
    return selectedServiceType.pricePerHour; // Simplified for MVP (1 hour default)
  };

  const handleServiceChange = (id: string) => {
    if (id === serviceId) return;
    setIsSwitching(true);
    setServiceId(id);
    // Small delay to allow cleanup
    setTimeout(() => {
      setIsSwitching(false);
    }, 300); // Increased delay for safety
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-careem-primary"></div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-careem-primary px-6 py-4">
            <h1 className="text-xl font-bold text-white">Создание заказа</h1>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Service Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Выберите услугу <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SERVICE_TYPES.map((service) => {
                let isAvailable = true;
                let displayPrice: string | number = service.pricePerHour;

                if (selectedExecutor) {
                  const customService = selectedExecutor.customServices?.find(
                    (s: any) => s.serviceId === service.id && s.enabled
                  );
                  if (customService) {
                    displayPrice = customService.price;
                  } else {
                    isAvailable = false;
                  }
                } else {
                   // Find min price for "Any available specialist"
                   const allPrices = executors
                    .map(ex => {
                      const customService = ex.customServices?.find((s: any) => s.serviceId === service.id && s.enabled);
                      return customService ? customService.price : null;
                    })
                    .filter(p => p !== null && p !== undefined) as number[];
                  
                   if (allPrices.length > 0) {
                      const minPrice = Math.min(...allPrices);
                      displayPrice = `от ${minPrice}`;
                   }
                }

                return (
                  <div 
                    key={service.id}
                    onClick={() => isAvailable && handleServiceChange(service.id)}
                    className={`border rounded-lg p-3 transition relative ${
                      !isAvailable 
                        ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed grayscale' 
                        : serviceId === service.id 
                          ? 'border-careem-primary bg-green-50 ring-1 ring-careem-primary cursor-pointer' 
                          : 'border-gray-200 hover:border-green-300 cursor-pointer'
                    }`}
                  >
                    <div className="font-medium text-gray-900 flex justify-between items-start">
                       <span>{service.name}</span>
                       {isAvailable && selectedExecutor && (
                         <span className="text-xs bg-green-100 text-careem-primary px-2 py-0.5 rounded-full ml-2 shrink-0">
                           Тариф
                         </span>
                       )}
                    </div>
                    <div className={`text-sm mt-1 ${isAvailable ? 'text-gray-500' : 'text-gray-400'}`}>
                      {isAvailable ? `${displayPrice} ₽/час` : 'Не предоставляется'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Executor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Выберите помощника <span className="text-red-500">*</span>
            </label>
            <select
              value={executorId}
              onChange={(e) => setExecutorId(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-careem-primary focus:border-careem-primary sm:text-sm rounded-md border"
            >
              <option value="">-- Любой свободный специалист --</option>
              {executors.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.rating} ★)
                </option>
              ))}
            </select>
          </div>

          {/* Option to allow others to respond if rejected */}
          {executorId && (
            <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-start gap-3">
              <input
                type="checkbox"
                id="allowOpenSelection"
                checked={allowOpenSelection}
                onChange={(e) => setAllowOpenSelection(e.target.checked)}
                className="mt-1 w-5 h-5 text-careem-primary rounded focus:ring-careem-primary border-gray-300"
              />
              <label htmlFor="allowOpenSelection" className="text-sm text-indigo-900 cursor-pointer select-none">
                <span className="font-bold block mb-1">Если {selectedExecutor?.name} откажется:</span>
                Разрешить другим помощникам откликаться на этот заказ (вы сможете выбрать исполнителя из списка откликнувшихся)
              </label>
            </div>
          )}

          {/* Location Selection */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative">
             <h3 className="font-medium text-gray-900 mb-4">Место оказания услуги</h3>
             
             {isSwitching && (
               <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center backdrop-blur-sm rounded-xl">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-careem-primary"></div>
               </div>
             )}

             <div className="grid grid-cols-1 gap-4">
                 <UnifiedMapPicker 
                    serviceId={serviceId}
                    locationFrom={locationFrom}
                    locationTo={locationTo}
                    generalLocation={generalLocation}
                    setLocationFrom={setLocationFrom}
                    setLocationTo={setLocationTo}
                    setGeneralLocation={setGeneralLocation}
                 />
             </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="shadow-sm focus:ring-careem-primary focus:border-careem-primary block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Время <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="shadow-sm focus:ring-careem-primary focus:border-careem-primary block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
          </div>

          {/* Details */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Детали заказа (адрес, особенности)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="shadow-sm focus:ring-careem-primary focus:border-careem-primary block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              placeholder="Например: встреча у главного входа, нужен пандус..."
            />
          </div>

          {/* Voice Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Голосовое сообщение (для помощника)
            </label>
            <div className="flex items-center gap-4">
              {!isRecording && !voiceMessage && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-full hover:bg-red-200 transition"
                >
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                  Записать сообщение
                </button>
              )}

              {isRecording && (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition animate-pulse"
                >
                  <i className="fas fa-stop"></i> Остановить запись
                </button>
              )}

              {voiceMessage && (
                <div className="flex items-center gap-3 w-full">
                  <audio src={voiceMessage} controls className="h-10 w-full max-w-xs" />
                  <button
                    type="button"
                    onClick={clearRecording}
                    className="text-gray-400 hover:text-red-500 transition p-2"
                    title="Удалить запись"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Вы можете записать пожелания голосом, если неудобно печатать.
            </p>
          </div>

          {/* Price Input */}
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">
                {selectedExecutor ? 'Стоимость услуги (Тариф помощника)' : 'Предложите вашу цену (₽)'} <span className="text-red-500">*</span>
             </label>
             <div className="relative rounded-md shadow-sm">
               <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                 <span className="text-gray-500 sm:text-sm">₽</span>
               </div>
               <input
                 type="number"
                 value={price || ''}
                 readOnly={!!selectedExecutor}
                 onChange={(e) => !selectedExecutor && setPrice(Number(e.target.value))}
                 className={`block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-careem-primary focus:ring-careem-primary sm:text-sm border p-2 ${
                   selectedExecutor ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                 }`}
                 placeholder="0.00"
                 min="0"
               />
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                 <span className="text-gray-500 sm:text-sm">RUB</span>
               </div>
             </div>
             {selectedExecutor && (
               <p className="mt-1 text-sm text-gray-500">
                 * Цена установлена выбранным помощником.
               </p>
             )}
          </div>

          {/* Total Price Estimate (Legacy display removed) */}
          {/* {selectedServiceType && (
            <div className="bg-gray-50 p-4 rounded-md flex justify-between items-center">
              <span className="text-gray-700 font-medium">Итоговая стоимость (примерно):</span>
              <span className="text-xl font-bold text-careem-primary">{price} ₽</span>
            </div>
          )} */}

          {/* Submit Button */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
             <div className="text-lg font-bold text-gray-900">
               Итого: <span className="text-careem-primary">{price} ₽</span>
             </div>
             <button
              type="submit"
              disabled={isSubmitting}
              className={`bg-careem-primary text-white font-bold py-3 px-8 rounded-xl hover:bg-careem-dark transition shadow-lg shadow-green-200 flex items-center gap-2 ${
                isSubmitting ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Создание...
                </>
              ) : (
                <>
                  <span>Создать заказ</span>
                  <i className="fas fa-arrow-right"></i>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateOrder;
