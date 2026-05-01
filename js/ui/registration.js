/* ════════════════════════════════════════════════════════════════════
   ui/registration.js
   India location data + state/city dropdown bindings.
════════════════════════════════════════════════════════════════════ */

const INDIA_LOCATIONS = {
  "Andhra Pradesh":     ["Visakhapatnam","Vijayawada","Guntur","Nellore","Kurnool","Rajahmundry","Tirupati","Kadapa","Kakinada","Anantapur","Eluru","Ongole","Vizianagaram","Chittoor","Proddatur"],
  "Arunachal Pradesh":  ["Itanagar","Naharlagun","Pasighat","Tezpur","Bomdila"],
  "Assam":              ["Guwahati","Silchar","Dibrugarh","Jorhat","Nagaon","Tinsukia","Tezpur","Bongaigaon","Dhubri","Karimganj"],
  "Bihar":              ["Patna","Gaya","Bhagalpur","Muzaffarpur","Purnia","Darbhanga","Bihar Sharif","Arrah","Begusarai","Katihar","Munger","Chhapra","Hajipur","Sasaram","Siwan"],
  "Chhattisgarh":       ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Raigarh","Ambikapur","Dhamtari"],
  "Delhi":              ["New Delhi","Central Delhi","North Delhi","South Delhi","East Delhi","West Delhi","North East Delhi","North West Delhi","Dwarka","Rohini"],
  "Goa":                ["Panaji","Margao","Vasco da Gama","Mapusa","Ponda","Bicholim","Canacona","Sanquelim"],
  "Gujarat":            ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar","Anand","Morbi","Nadiad","Bharuch","Mehsana","Surendranagar","Amreli"],
  "Haryana":            ["Gurugram","Faridabad","Panipat","Ambala","Yamunanagar","Rohtak","Hisar","Karnal","Sonipat","Panchkula","Bhiwani","Bahadurgarh","Kaithal","Rewari","Sirsa"],
  "Himachal Pradesh":   ["Shimla","Manali","Dharamshala","Solan","Mandi","Kullu","Nahan","Palampur","Una","Bilaspur"],
  "Jharkhand":          ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Deoghar","Phusro","Hazaribagh","Giridih","Ramgarh","Medininagar"],
  "Karnataka":          ["Bengaluru","Mysuru","Hubballi","Mangaluru","Belagavi","Kalaburagi","Ballari","Tumkuru","Shivamogga","Vijayapura","Bidar","Raichur","Davangere","Hassan","Udupi"],
  "Kerala":             ["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Palakkad","Alappuzha","Kannur","Malappuram","Kottayam","Kasaragod","Pathanamthitta","Idukki","Wayanad","Ernakulam"],
  "Madhya Pradesh":     ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa","Murwara","Singrauli","Burhanpur","Khandwa","Bhind"],
  "Maharashtra":        ["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Nanded","Sangli","Thane","Pimpri-Chinchwad","Vasai-Virar","Navi Mumbai","Latur"],
  "Manipur":            ["Imphal","Thoubal","Bishnupur","Churachandpur","Senapati"],
  "Meghalaya":          ["Shillong","Tura","Nongstoin","Jowai","Baghmara"],
  "Mizoram":            ["Aizawl","Lunglei","Champhai","Serchhip","Kolasib"],
  "Nagaland":           ["Kohima","Dimapur","Mokokchung","Tuensang","Wokha"],
  "Odisha":             ["Bhubaneswar","Cuttack","Rourkela","Brahmapur","Sambalpur","Puri","Balasore","Bhadrak","Baripada","Jharsuguda"],
  "Punjab":             ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali","Hoshiarpur","Gurdaspur","Pathankot","Moga","Firozpur","Muktsar","Fatehgarh Sahib","Kapurthala","Nawanshahr"],
  "Rajasthan":          ["Jaipur","Jodhpur","Udaipur","Kota","Bikaner","Ajmer","Bharatpur","Alwar","Bhilwara","Sikar","Sriganganagar","Pali","Barmer","Chittorgarh","Jhalawar"],
  "Sikkim":             ["Gangtok","Namchi","Gyalshing","Mangan"],
  "Tamil Nadu":         ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Tiruppur","Vellore","Erode","Thoothukkudi","Dindigul","Thanjavur","Ranipet","Sivakasi","Karur"],
  "Telangana":          ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Ramagundam","Mahbubnagar","Nalgonda","Adilabad","Suryapet","Miryalaguda","Jagtial","Mancherial","Kothagudem","Siddipet"],
  "Tripura":            ["Agartala","Dharmanagar","Udaipur","Kailashahar","Belonia"],
  "Uttar Pradesh":      ["Lucknow","Kanpur","Agra","Varanasi","Prayagraj","Meerut","Noida","Ghaziabad","Bareilly","Moradabad","Aligarh","Gorakhpur","Saharanpur","Mathura","Faizabad","Muzaffarnagar","Firozabad","Hapur"],
  "Uttarakhand":        ["Dehradun","Haridwar","Roorkee","Haldwani","Rishikesh","Kashipur","Rudrapur","Pithoragarh","Nainital","Mussoorie"],
  "West Bengal":        ["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda","Baharampur","Habra","Kharagpur","Shantipur","Dankuni","Dhulian","Ranaghat","Haldia"],
  "Andaman & Nicobar":  ["Port Blair","Car Nicobar","Rangat","Diglipur","Mayabunder"],
  "Chandigarh":         ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Silvassa","Daman","Diu"],
  "Jammu & Kashmir":    ["Srinagar","Jammu","Anantnag","Baramulla","Sopore","Udhampur","Kathua","Poonch","Rajouri","Leh"],
  "Ladakh":             ["Leh","Kargil"],
  "Lakshadweep":        ["Kavaratti","Agatti","Andrott","Minicoy"],
  "Puducherry":         ["Puducherry","Karaikal","Mahe","Yanam"]
};

function initStateDropdown() {
  const sel = document.getElementById('r-state');
  Object.keys(INDIA_LOCATIONS).sort().forEach(state => {
    const opt = document.createElement('option');
    opt.value = state; opt.textContent = state;
    sel.appendChild(opt);
  });
}

function populateCities() {
  const state = document.getElementById('r-state').value;
  const cityEl = document.getElementById('r-city');
  cityEl.innerHTML = '';
  if (!state) {
    cityEl.innerHTML = '<option value="">Select State first</option>';
    cityEl.disabled = true;
    return;
  }
  cityEl.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Select City';
  cityEl.appendChild(placeholder);
  (INDIA_LOCATIONS[state] || []).sort().forEach(city => {
    const opt = document.createElement('option');
    opt.value = city; opt.textContent = city;
    cityEl.appendChild(opt);
  });
  // Clear validation error when state is picked
  document.getElementById('e-state').style.display = 'none';
}

// Initialise on load
document.addEventListener('DOMContentLoaded', initStateDropdown);


export { INDIA_LOCATIONS, initStateDropdown, populateCities };
