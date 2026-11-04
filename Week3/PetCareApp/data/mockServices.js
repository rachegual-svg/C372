// Mock service catalogue. Prices here are the ONLY source of truth for payment amounts.
const services = [
  {
    id: 1,
    name: 'Vaccination',
    price: 35,
    duration: '30 mins',
    description: 'Core vaccinations administered by a licensed vet to keep your pet protected.'
  },
  {
    id: 2,
    name: 'Pet Grooming',
    price: 50,
    duration: '1.5 hours',
    description: 'Bath, brush, nail trim and ear cleaning so your pet looks and feels great.'
  },
  {
    id: 3,
    name: 'Boarding',
    price: 80,
    duration: 'Per night',
    description: 'A safe, comfortable overnight stay with feeding, walks and plenty of attention.'
  }
];

function findServiceById(id) {
  return services.find(item => item.id === Number(id));
}

module.exports = services;
module.exports.findServiceById = findServiceById;
