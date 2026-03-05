import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SERVICE_TYPES } from '../constants';
import { UserRole, OrderStatus, Order, Location } from '../types';
import { toast } from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import ErrorBoundary from '../components/ErrorBoundary';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getSupabase } from '../services/supabaseClient';
import { profileRowToUser } from '../services/mappers';

// Fix for default Leaflet markers
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
    setMapCenter([lat, lng]);

    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then(response => response.json())
      .then(data => {
        if (data && data.display_name) {
          setter({ lat, lng, address: data.display_name });
        } else {
          const fallbackAddress = `Точка на карте: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setter({ lat, lng, address: fallbackAddress });
        }
      })
      .catch(err => {
        console.error('Ошибка геокодирования:', err);
        const fallbackAddress = `Точка на карте: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setter({ lat, lng, address: fallbackAddress });
      });
  };

  return (
    <div className="mb-4">
      {/* Controls for Transport Mode */}
      {serviceId === '3' && (
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-sm font-semibold text-slate-200">Выберите точку для установки на карте:</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveInput('from')}
              className={[
                'px-3 py-2 rounded-2xl text-sm font-semibold transition border',
                activeInput === 'from'
                  ? 'bg-green-500/15 text-green-200 border-green-500/25'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
              ].join(' ')}
            >
              Точка A
            </button>
            <button
              type="button"
              onClick={() => setActiveInput('to')}
              className={[
                'px-3 py-2 rounded-2xl text-sm font-semibold transition border',
                activeInput === 'to'
                  ? 'bg-red-500/15 text-red-200 border-red-500/25'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
              ].join(' ')}
            >
              Точка B
            </button>
          </div>
        </div>
      )}

      {/* Controls for General Mode */}
      {serviceId !== '3' && (
        <div className="mb-3">
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Место встречи <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">
            Укажите примерный район или место встречи. Точный адрес (квартира, подъезд) вы сможете сообщить помощнику лично.
          </p>
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <i className={`fas ${generalLocation ? 'fa-map-marker-alt text-careem-primary' : 'fa-search text-slate-500'}`}></i>
            </div>
            <input
              type="text"
              value={generalLocation?.address || ''}
              readOnly
              className="block w-full rounded-xl border border-white/10 pl-10 focus:border-careem-primary focus:ring-careem-primary/60 sm:text-sm py-3 bg-[#0B1220]/60 text-slate-100 placeholder-slate-500"
              placeholder="Нажмите на карту для выбора места"
            />
          </div>
        </div>
      )}

      {/* Unified Map Instance - Never Unmounts */}
      <div className="h-96 rounded-2xl overflow-hidden border border-white/10 relative z-0 bg-white/5">
        <ErrorBoundary fallback={<div className="h-full w-full bg-white/5 flex items-center justify-center text-slate-400">Ошибка загрузки карты</div>}>
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
                color="#2D6BFF"
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
          <div className="absolute bottom-4 right-4 z-[1000] bg-[#0B1220]/75 px-4 py-2 rounded-2xl shadow-lg border border-white/10 flex items-center gap-2 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-[#13213A] p-2 rounded-full text-careem-primary border border-[#1B2D4F]">
              <i className="fas fa-route"></i>
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Расстояние</div>
              <div className="text-lg font-extrabold text-slate-100">{routeDistance.toFixed(1)} км</div>
            </div>
          </div>
        )}
      </div>

      {serviceId === '3' ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#0B1220]/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-xl bg-green-500/15 border border-green-500/25 text-green-200">
                A
              </span>
              Точка А (откуда)
            </div>
            <div className="mt-2 text-sm text-slate-100 break-words">
              {locationFrom?.address || 'Не выбрано'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B1220]/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-xl bg-red-500/15 border border-red-500/25 text-red-200">
                B
              </span>
              Точка Б (куда)
            </div>
            <div className="mt-2 text-sm text-slate-100 break-words">
              {locationTo?.address || 'Не выбрано'}
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-400 mt-3 text-center">
        {serviceId === '3'
          ? '* Нажмите на поле "Откуда" или "Куда", затем кликните по карте.'
          : '* Выберите точку встречи на карте.'}
      </p>
    </div>
  );
};

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);  // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180)
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
  const [allowOpenSelection, setAllowOpenSelection] = useState(true);
  const [details, setDetails] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [executors, setExecutors] = useState<any[]>([]);
  const [realRatings, setRealRatings] = useState<Record<string, string>>({});

  // Ref to track if we've already handled the URL preselection to avoid overriding user changes
  const hasHandledPreselection = useRef(false);


  useEffect(() => {
    const fetchRealRatings = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data } = await supabase
        .from('orders')
        .select('executor_id, rating')
        .not('rating', 'is', null)
        .gt('rating', 0);

      if (data) {
        const ratingsMap: Record<string, number[]> = {};
        data.forEach((row: any) => {
          if (row.executor_id) {
            if (!ratingsMap[row.executor_id]) ratingsMap[row.executor_id] = [];
            ratingsMap[row.executor_id].push(row.rating);
          }
        });

        const averages: Record<string, string> = {};
        Object.keys(ratingsMap).forEach(id => {
          const ratings = ratingsMap[id];
          const sum = ratings.reduce((a, b) => a + b, 0);
          averages[id] = (sum / ratings.length).toFixed(1);
        });
        setRealRatings(averages);
      }
    };

    fetchRealRatings();
  }, []);
  const [locationFrom, setLocationFrom] = useState<Location | undefined>(undefined);
  const [locationTo, setLocationTo] = useState<Location | undefined>(undefined);
  const [generalLocation, setGeneralLocation] = useState<Location | undefined>(undefined);

  const audioBlobToWavDataUrl = async (blob: Blob): Promise<string> => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext: AudioContext = new AudioContextCtor();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      const numberOfChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const samples = audioBuffer.length;
      const bitsPerSample = 16;
      const blockAlign = numberOfChannels * (bitsPerSample / 8);
      const byteRate = sampleRate * blockAlign;
      const dataSize = samples * blockAlign;

      const wavBuffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wavBuffer);
      const writeString = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);

      const channelData = Array.from({ length: numberOfChannels }, (_, ch) => audioBuffer.getChannelData(ch));
      let offset = 44;
      for (let i = 0; i < samples; i++) {
        for (let ch = 0; ch < numberOfChannels; ch++) {
          let sample = channelData[ch][i];
          sample = Math.max(-1, Math.min(1, sample));
          const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          view.setInt16(offset, int16, true);
          offset += 2;
        }
      }

      const bytes = new Uint8Array(wavBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      return `data:audio/wav;base64,${base64}`;
    } finally {
      await audioContext.close();
    }
  };



  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
      toast('Пожалуйста, войдите в систему для оформления заказа', { icon: '🔒' });
      return;
    }



    const supabase = getSupabase();
    if (!supabase) {
      setExecutors([]);
      return;
    }

    let isActive = true;
    void (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', UserRole.EXECUTOR);
      if (!isActive) return;
      if (error || !Array.isArray(data)) {
        setExecutors([]);
        return;
      }

      const validExecutors = data
        .map(profileRowToUser)
        .filter((u: any) => u.role === UserRole.EXECUTOR && (u.subscriptionStatus !== 'active' || u.subscribedToCustomerId === user?.id));

      if (preselectedExecutorId) {
        if (!hasHandledPreselection.current) {
          setExecutorId(preselectedExecutorId);
          hasHandledPreselection.current = true;
        }
        const selected = validExecutors.find((u: any) => u.id === preselectedExecutorId);
        setExecutors(selected ? [selected] : validExecutors);
      } else {
        hasHandledPreselection.current = true; // Mark as handled if no preselection
        setExecutors(validExecutors);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [user, isLoading, preselectedExecutorId, navigate]);

  // Cleanup media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4'
      ];

      const supportedMimeType = preferredMimeTypes.find((t) => {
        try {
          return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        setIsProcessingAudio(true);

        if (chunksRef.current.length === 0) {
          setIsProcessingAudio(false);
          return;
        }

        const blobType =
          recorder.mimeType ||
          (chunksRef.current[0] instanceof Blob ? chunksRef.current[0].type : '') ||
          supportedMimeType ||
          'audio/webm';

        const blob = new Blob(chunksRef.current, { type: blobType });

        void (async () => {
          try {
            // Try to convert to WAV for better compatibility
            const wavDataUrl = await audioBlobToWavDataUrl(blob);
            setVoiceMessage(wavDataUrl);
          } catch (error) {
            console.error('Audio conversion failed:', error);
            // Fallback to basic reader if conversion fails
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                setVoiceMessage(reader.result);
              }
            };
          } finally {
            stream.getTracks().forEach(track => track.stop());
            setIsProcessingAudio(false);
          }
        })();
      };

      // Use timeslice (200ms) to ensure data is available periodically
      recorder.start(200);
      setIsRecording(true);
    } catch (err) {
      toast.error('Не удалось получить доступ к микрофону');
      console.error(err);
    }
  };

  const stopRecording = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (mediaRecorderRef.current && isRecording) {
      setIsProcessingAudio(true); // Set processing state immediately to prevent UI flicker
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const clearRecording = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
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

  const handleSubmit = async (e: React.FormEvent) => {
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
    try {
      const supabase = getSupabase();
      if (!supabase) {
        toast.error('Supabase не настроен');
        return;
      }

      const payload = {
        customer_id: user.id,
        executor_id: executorId || null,
        service_type: selectedServiceType?.name || 'Услуга',
        date,
        time,
        status: executorId ? OrderStatus.PENDING : OrderStatus.OPEN,
        total_price: price,
        details: details || null,
        allow_open_selection: executorId ? allowOpenSelection : true, // Force true for open orders
        responses: [],
        voice_message_url: voiceMessage || null,
        location_from: serviceId === '3' ? locationFrom : null,
        location_to: serviceId === '3' ? locationTo : null,
        general_location: serviceId !== '3' ? generalLocation : null
      };

      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;

      toast.success('Заказ создан успешно!');
      navigate('/dashboard?tab=orders');
    } catch (err: any) {
      toast.error(err?.message || 'Не удалось создать заказ');
    } finally {
      setIsSubmitting(false);
    }
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
      <div className="py-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-careem-primary"></div>
      </div>
    );
  }

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto rounded-3xl border border-white/10 bg-[#0B1220]/60 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10">
          <h1 className="text-xl font-extrabold text-slate-100">Создание заказа</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Service Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
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
                    className={`border rounded-2xl p-4 transition relative ${!isAvailable
                        ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed grayscale'
                        : serviceId === service.id
                          ? 'border-careem-primary bg-[#13213A] ring-1 ring-careem-primary/40 cursor-pointer'
                          : 'border-white/10 hover:border-white/20 bg-white/5 cursor-pointer'
                      }`}
                  >
                    <div className="font-semibold text-slate-100 flex justify-between items-start gap-3">
                      <span>{service.name}</span>
                      {isAvailable && selectedExecutor && (
                        <span className="text-xs bg-[#13213A] text-slate-200 px-2 py-0.5 rounded-full border border-[#1B2D4F] shrink-0">
                          Тариф
                        </span>
                      )}
                    </div>
                    <div className={`text-sm mt-2 ${isAvailable ? 'text-slate-400' : 'text-slate-500'}`}>
                      {isAvailable ? `${displayPrice} ₽/час` : 'Не предоставляется'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Executor Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              Выберите помощника <span className="text-red-500">*</span>
            </label>
            <select
              value={executorId}
              onChange={(e) => setExecutorId(e.target.value)}
              className="mt-1 block w-full pl-4 pr-10 py-3 text-base border border-white/10 focus:outline-none focus:ring-2 focus:ring-careem-primary/60 focus:border-careem-primary sm:text-sm rounded-xl bg-[#0B1220]/60 text-slate-100"
            >
              <option value="">-- Любой свободный специалист --</option>
              {executors.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({realRatings[ex.id] || ex.rating || '0.0'} ★)
                </option>
              ))}
            </select>
          </div>

          {/* Location Selection */}
          <div className="bg-white/5 p-4 sm:p-6 rounded-3xl border border-white/10 relative">
            <h3 className="font-bold text-slate-100 mb-4">Место оказания услуги</h3>

            {isSwitching && (
              <div className="absolute inset-0 bg-[#0B1220]/40 z-10 flex items-center justify-center backdrop-blur-sm rounded-3xl">
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
              <label className="block text-sm font-semibold text-slate-200 mb-2">
                Дата <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="shadow-sm focus:ring-2 focus:ring-careem-primary/60 focus:border-careem-primary block w-full sm:text-sm border border-white/10 rounded-xl py-3 pl-4 pr-4 bg-[#0B1220]/60 text-slate-100 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-2">
                Время <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="shadow-sm focus:ring-2 focus:ring-careem-primary/60 focus:border-careem-primary block w-full sm:text-sm border border-white/10 rounded-xl py-3 pl-4 pr-4 bg-[#0B1220]/60 text-slate-100 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Details */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              Детали заказа (адрес, особенности)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="shadow-sm focus:ring-2 focus:ring-careem-primary/60 focus:border-careem-primary block w-full sm:text-sm border border-white/10 rounded-xl py-3 px-4 bg-[#0B1220]/60 text-slate-100 placeholder-slate-500"
              placeholder="Например: встреча у главного входа, нужен пандус..."
            />
          </div>

          {/* Voice Message */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              Голосовое сообщение (для помощника)
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {!isRecording && !voiceMessage && !isProcessingAudio && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center justify-center gap-2 bg-red-500/15 text-red-200 px-4 py-2.5 rounded-2xl border border-red-500/25 hover:bg-red-500/20 transition w-full sm:w-auto"
                >
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                  Записать сообщение
                </button>
              )}

              {isProcessingAudio && (
                <div className="flex items-center gap-3 text-slate-300 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/10">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-careem-primary"></div>
                  <span>Обработка записи...</span>
                </div>
              )}

              {isRecording && (
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-2xl hover:bg-red-700 transition w-full sm:w-auto"
                  >
                    <i className="fas fa-stop"></i> Остановить запись
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <div className="flex items-end gap-1 h-6">
                      <span className="w-1 bg-red-400/80 rounded-full animate-pulse" style={{ height: 8 }} />
                      <span className="w-1 bg-red-400/80 rounded-full animate-pulse" style={{ height: 18, animationDelay: '120ms' }} />
                      <span className="w-1 bg-red-400/80 rounded-full animate-pulse" style={{ height: 12, animationDelay: '240ms' }} />
                      <span className="w-1 bg-red-400/80 rounded-full animate-pulse" style={{ height: 20, animationDelay: '360ms' }} />
                      <span className="w-1 bg-red-400/80 rounded-full animate-pulse" style={{ height: 10, animationDelay: '480ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {voiceMessage && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full min-w-0">
                  <audio src={voiceMessage} controls className="h-10 w-full" />
                  <button
                    type="button"
                    onClick={clearRecording}
                    className="text-slate-400 hover:text-red-400 transition p-2 self-end sm:self-auto"
                    title="Удалить запись"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Вы можете записать пожелания голосом, если неудобно печатать.
            </p>
          </div>

          {/* Price Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              {selectedExecutor ? 'Стоимость услуги (Тариф помощника)' : 'Предложите вашу цену (₽)'} <span className="text-red-500">*</span>
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-slate-400 sm:text-sm">₽</span>
              </div>
              <input
                type="number"
                value={price || ''}
                readOnly={!!selectedExecutor}
                onChange={(e) => !selectedExecutor && setPrice(Number(e.target.value))}
                className={`block w-full rounded-xl border border-white/10 pl-7 pr-12 focus:border-careem-primary focus:ring-careem-primary/60 sm:text-sm border py-3 px-4 bg-[#0B1220]/60 text-slate-100 ${selectedExecutor ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                placeholder="0.00"
                min="0"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <span className="text-slate-400 sm:text-sm">RUB</span>
              </div>
            </div>
            {selectedExecutor && (
              <p className="mt-2 text-sm text-slate-400">
                * Цена установлена выбранным помощником.
              </p>
            )}
          </div>

          {/* Allow Open Selection Checkbox */}
          {executorId && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-start gap-3">
              <div className="flex h-6 items-center">
                <input
                  id="allow-open-selection"
                  name="allow-open-selection"
                  type="checkbox"
                  checked={allowOpenSelection}
                  onChange={(e) => setAllowOpenSelection(e.target.checked)}
                  className="h-5 w-5 rounded border-white/10 bg-[#0B1220]/60 text-careem-primary focus:ring-careem-primary/60 focus:ring-offset-0"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="allow-open-selection" className="font-medium text-slate-200 block cursor-pointer">
                  Если выбранный помощник откажется, отправить заказ всем
                </label>
                <p className="text-slate-400 mt-1">
                  При отказе конкретного исполнителя заказ автоматически станет доступен всем свободным помощникам в ленте.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-white/10">
            <div className="text-lg font-extrabold text-slate-100">
              Итого: <span className="text-careem-primary">{price} ₽</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || isProcessingAudio || isRecording}
              className={`bg-careem-primary/80 text-white font-semibold py-3 px-8 rounded-2xl hover:bg-[#255EE6] transition shadow-lg shadow-[#2D6BFF]/20 flex items-center justify-center gap-2 w-full sm:w-auto ${(isSubmitting || isProcessingAudio || isRecording) ? 'opacity-70 cursor-wait' : ''
                }`}
            >
              {isSubmitting || isProcessingAudio ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {isProcessingAudio ? 'Обработка...' : 'Создание...'}
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
