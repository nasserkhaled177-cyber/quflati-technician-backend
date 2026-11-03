const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main(){
  const hashed = await bcrypt.hash("123456", 10);
  await prisma.technician.deleteMany({ where: { email: "tech@quflaty.com" } });
  const user = await prisma.technician.create({
    data: {
      email: "tech@quflaty.com",
      password: hashed,
      name: "Technician Riyadh",
      phone: "0500000000",
      specialty: "General",
      isActive: true
    }
  });
  console.log("✅ تم انشاء الفني:", user);
}
main().finally(()=>process.exit());
