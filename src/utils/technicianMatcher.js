const prisma = require("../utils/prisma");
exports.findTechnician = async ({ city = "Riyadh", serviceType }) => {
  const saudiCities = ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah"];
  const targetCity = saudiCities.includes(city)? city : "Riyadh";
  const tech = await prisma.technician.findFirst({
    where: { city: targetCity, isAvailable: true, specialties: { has: serviceType } },
    orderBy: { rating: 'desc' }
  });
  return tech;
};
