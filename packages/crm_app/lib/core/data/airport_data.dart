/// Static airport data for searchable dropdown in voucher forms.
class Airport {
  final String code;
  final String name;
  final String city;
  final String country;

  const Airport({
    required this.code,
    required this.name,
    required this.city,
    required this.country,
  });

  String get displayName => '$code - $name, $city';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is Airport && code == other.code;

  @override
  int get hashCode => code.hashCode;
}

const List<Airport> majorAirports = [
  // India
  Airport(code: 'DEL', name: 'Indira Gandhi Intl', city: 'New Delhi', country: 'India'),
  Airport(code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai', country: 'India'),
  Airport(code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India'),
  Airport(code: 'MAA', name: 'Chennai Intl', city: 'Chennai', country: 'India'),
  Airport(code: 'HYD', name: 'Rajiv Gandhi Intl', city: 'Hyderabad', country: 'India'),
  Airport(code: 'CCU', name: 'Netaji Subhas Chandra Bose Intl', city: 'Kolkata', country: 'India'),
  Airport(code: 'COK', name: 'Cochin Intl', city: 'Kochi', country: 'India'),
  Airport(code: 'GOI', name: 'Goa Intl (Dabolim)', city: 'Goa', country: 'India'),
  Airport(code: 'PNQ', name: 'Pune Airport', city: 'Pune', country: 'India'),
  Airport(code: 'AMD', name: 'Sardar Vallabhbhai Patel Intl', city: 'Ahmedabad', country: 'India'),
  Airport(code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', country: 'India'),
  Airport(code: 'GAU', name: 'Lokpriya Gopinath Bordoloi Intl', city: 'Guwahati', country: 'India'),
  Airport(code: 'LKO', name: 'Chaudhary Charan Singh Intl', city: 'Lucknow', country: 'India'),
  Airport(code: 'IXC', name: 'Chandigarh Airport', city: 'Chandigarh', country: 'India'),
  Airport(code: 'SXR', name: 'Sheikh ul-Alam Intl', city: 'Srinagar', country: 'India'),
  Airport(code: 'VNS', name: 'Lal Bahadur Shastri Intl', city: 'Varanasi', country: 'India'),
  Airport(code: 'TRV', name: 'Trivandrum Intl', city: 'Thiruvananthapuram', country: 'India'),
  Airport(code: 'IXB', name: 'Bagdogra Airport', city: 'Siliguri', country: 'India'),
  Airport(code: 'PAT', name: 'Jay Prakash Narayan Intl', city: 'Patna', country: 'India'),

  // Middle East
  Airport(code: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'UAE'),
  Airport(code: 'AUH', name: 'Abu Dhabi Intl', city: 'Abu Dhabi', country: 'UAE'),
  Airport(code: 'SHJ', name: 'Sharjah Intl', city: 'Sharjah', country: 'UAE'),
  Airport(code: 'DOH', name: 'Hamad Intl', city: 'Doha', country: 'Qatar'),
  Airport(code: 'BAH', name: 'Bahrain Intl', city: 'Manama', country: 'Bahrain'),
  Airport(code: 'MCT', name: 'Muscat Intl', city: 'Muscat', country: 'Oman'),
  Airport(code: 'KWI', name: 'Kuwait Intl', city: 'Kuwait City', country: 'Kuwait'),
  Airport(code: 'RUH', name: 'King Khalid Intl', city: 'Riyadh', country: 'Saudi Arabia'),
  Airport(code: 'JED', name: 'King Abdulaziz Intl', city: 'Jeddah', country: 'Saudi Arabia'),

  // Southeast Asia
  Airport(code: 'SIN', name: 'Changi', city: 'Singapore', country: 'Singapore'),
  Airport(code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Thailand'),
  Airport(code: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', country: 'Malaysia'),
  Airport(code: 'CGK', name: 'Soekarno-Hatta Intl', city: 'Jakarta', country: 'Indonesia'),
  Airport(code: 'DPS', name: 'Ngurah Rai Intl', city: 'Bali', country: 'Indonesia'),
  Airport(code: 'MNL', name: 'Ninoy Aquino Intl', city: 'Manila', country: 'Philippines'),
  Airport(code: 'HAN', name: 'Noi Bai Intl', city: 'Hanoi', country: 'Vietnam'),
  Airport(code: 'SGN', name: 'Tan Son Nhat Intl', city: 'Ho Chi Minh City', country: 'Vietnam'),
  Airport(code: 'CMB', name: 'Bandaranaike Intl', city: 'Colombo', country: 'Sri Lanka'),
  Airport(code: 'KTM', name: 'Tribhuvan Intl', city: 'Kathmandu', country: 'Nepal'),
  Airport(code: 'DAC', name: 'Hazrat Shahjalal Intl', city: 'Dhaka', country: 'Bangladesh'),
  Airport(code: 'MLE', name: 'Velana Intl', city: 'Malé', country: 'Maldives'),

  // East Asia
  Airport(code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', country: 'China'),
  Airport(code: 'PEK', name: 'Beijing Capital Intl', city: 'Beijing', country: 'China'),
  Airport(code: 'PVG', name: 'Shanghai Pudong Intl', city: 'Shanghai', country: 'China'),
  Airport(code: 'NRT', name: 'Narita Intl', city: 'Tokyo', country: 'Japan'),
  Airport(code: 'HND', name: 'Haneda', city: 'Tokyo', country: 'Japan'),
  Airport(code: 'ICN', name: 'Incheon Intl', city: 'Seoul', country: 'South Korea'),
  Airport(code: 'TPE', name: 'Taiwan Taoyuan Intl', city: 'Taipei', country: 'Taiwan'),

  // Europe
  Airport(code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom'),
  Airport(code: 'LGW', name: 'Gatwick', city: 'London', country: 'United Kingdom'),
  Airport(code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France'),
  Airport(code: 'AMS', name: 'Schiphol', city: 'Amsterdam', country: 'Netherlands'),
  Airport(code: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Germany'),
  Airport(code: 'MUC', name: 'Munich', city: 'Munich', country: 'Germany'),
  Airport(code: 'ZRH', name: 'Zurich', city: 'Zurich', country: 'Switzerland'),
  Airport(code: 'FCO', name: 'Leonardo da Vinci–Fiumicino', city: 'Rome', country: 'Italy'),
  Airport(code: 'BCN', name: 'Barcelona-El Prat', city: 'Barcelona', country: 'Spain'),
  Airport(code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas', city: 'Madrid', country: 'Spain'),
  Airport(code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey'),
  Airport(code: 'ATH', name: 'Athens Intl', city: 'Athens', country: 'Greece'),
  Airport(code: 'VIE', name: 'Vienna Intl', city: 'Vienna', country: 'Austria'),
  Airport(code: 'CPH', name: 'Copenhagen', city: 'Copenhagen', country: 'Denmark'),

  // North America
  Airport(code: 'JFK', name: 'John F. Kennedy Intl', city: 'New York', country: 'United States'),
  Airport(code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'United States'),
  Airport(code: 'ORD', name: "O'Hare Intl", city: 'Chicago', country: 'United States'),
  Airport(code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', country: 'United States'),
  Airport(code: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'United States'),
  Airport(code: 'EWR', name: 'Newark Liberty Intl', city: 'Newark', country: 'United States'),
  Airport(code: 'YYZ', name: 'Toronto Pearson Intl', city: 'Toronto', country: 'Canada'),
  Airport(code: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', country: 'Canada'),
  Airport(code: 'MEX', name: 'Mexico City Intl', city: 'Mexico City', country: 'Mexico'),

  // Africa
  Airport(code: 'JNB', name: 'O.R. Tambo Intl', city: 'Johannesburg', country: 'South Africa'),
  Airport(code: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egypt'),
  Airport(code: 'NBO', name: 'Jomo Kenyatta Intl', city: 'Nairobi', country: 'Kenya'),
  Airport(code: 'ADD', name: 'Bole Intl', city: 'Addis Ababa', country: 'Ethiopia'),
  Airport(code: 'MRU', name: 'Sir Seewoosagur Ramgoolam Intl', city: 'Mauritius', country: 'Mauritius'),
  Airport(code: 'SEZ', name: 'Seychelles Intl', city: 'Mahé', country: 'Seychelles'),

  // Oceania
  Airport(code: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia'),
  Airport(code: 'MEL', name: 'Melbourne Tullamarine', city: 'Melbourne', country: 'Australia'),
  Airport(code: 'AKL', name: 'Auckland', city: 'Auckland', country: 'New Zealand'),
];
