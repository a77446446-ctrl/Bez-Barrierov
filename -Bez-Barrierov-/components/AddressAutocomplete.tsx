import React, { useState, useEffect, useRef } from 'react';
import { Location } from '../types';

interface AddressAutocompleteProps {
    label: string;
    value?: Location;
    onChange: (location: Location) => void;
    isActive: boolean;
    onFocus: () => void;
    color: string;
    placeholder?: string;
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
    label,
    value,
    onChange,
    isActive,
    onFocus,
    color,
    placeholder
}) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Update query when value (from props) changes (e.g. map click)
    useEffect(() => {
        if (value?.address) {
            setQuery(value.address);
        } else {
             if (!value) setQuery('');
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSearch = async (input: string) => {
        setQuery(input);
        if (input.length < 3) {
            setSuggestions([]);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&addressdetails=1&limit=5&accept-language=ru`
            );
            const data = await response.json();
            setSuggestions(data);
            setShowSuggestions(true);
        } catch (error) {
            console.error('Error fetching address suggestions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (item: any) => {
        const newLocation: Location = {
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            address: item.display_name
        };
        setQuery(item.display_name);
        setSuggestions([]);
        setShowSuggestions(false);
        onChange(newLocation);
    };

    return (
        <div 
            ref={wrapperRef}
            className={`p-3 rounded-lg border transition relative ${isActive ? 'border-careem-primary bg-green-50 ring-1 ring-careem-primary' : 'border-gray-200 hover:border-green-300'}`}
            onClick={onFocus}
        >
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${color}`}></span>
                {label}
            </label>
            <div className="relative">
                 <input
                    type="text"
                    className="w-full bg-transparent border-none p-0 text-sm text-gray-900 focus:ring-0 placeholder-gray-400 focus:outline-none"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => {
                        onFocus();
                        if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    placeholder={placeholder || "Введите адрес или выберите на карте"}
                />
                {isLoading && (
                    <div className="absolute right-0 top-0 h-full flex items-center">
                        <i className="fas fa-spinner fa-spin text-careem-primary"></i>
                    </div>
                )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-[2000] left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto w-full">
                    {suggestions.map((item, index) => (
                        <li 
                            key={index}
                            className="px-4 py-2 hover:bg-green-50 cursor-pointer text-sm text-gray-700 border-b last:border-0 border-gray-100 text-left"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelect(item);
                            }}
                        >
                            {item.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default AddressAutocomplete;
