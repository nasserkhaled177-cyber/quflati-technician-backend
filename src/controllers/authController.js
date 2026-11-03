const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    console.log("Login attempt:", email || phone);
    
    // يدعم دخول بالايميل او بالجوال
    let tech = null;
    if(email){
      tech = await prisma.technician.findFirst({ where: { phone: email } }).catch(()=>null) 
             || await prisma.technician.findUnique({ where: { phone: email } }).catch(()=>null);
      // لو عندك email في المودل مستقبلا
      try{ tech = tech || await prisma.technician.findFirst({ where: { email } }); }catch(e){}
    }
    if(!tech && phone){
      tech = await prisma.technician.findUnique({ where: { phone } });
    }
    if(!tech && email){
      tech = await prisma.technician.findUnique({ where: { phone: email } });
    }

    if (!tech) return res.status(404).json({ message: "Technician not found" });
    
    // يدعم باسورد plain 123456 + bcrypt
    let valid = false;
    if(tech.password && tech.password.startsWith('$2')){
      valid = await bcrypt.compare(password, tech.password);
    } else {
      valid = (password === tech.password || password === '123456');
      if(valid){
        const hashed = await bcrypt.hash(password,10);
        await prisma.technician.update({where:{id:tech.id}, data:{password:hashed}});
      }
    }
    
    if (!valid) return res.status(401).json({ message: "Wrong password" });
    const token = jwt.sign({ id: tech.id, phone: tech.phone }, process.env.JWT_SECRET || "quflaty_secret_2026", { expiresIn: "7d" });
    res.json({ token, id: tech.id, name: tech.name, phone: tech.phone, city: tech.city });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};
