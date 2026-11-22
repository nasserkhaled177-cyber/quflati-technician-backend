const express = require('express');
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "quflati-secret-change-me";
function makeTechToken(tech){
  return jwt.sign({ id: tech.id, name: tech.name, phone: tech.phone, email: tech.email || "", role: "technician" }, SECRET, { expiresIn: "7d" });
}
const router = express.Router();
const authController = require('../controllers/authController');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// مسار قديم - صار يدعم جوال الحين
router.post('/login', authController.login);
router.get('/me', authController.me);

// مسارات الفني الجديدة - 3004 quflati-technician-frontend
router.post('/technician/register', async (req,res)=>{
  try{
    const { name, phone, password, city, province, country, countryCode, specialty, lat, lng } = req.body;
        if(!phone) return res.status(400).json({error:'phone مطلوب'});
  const exists = await prisma.technician.findFirst({where:{phone}});
    if(exists) return res.status(400).json({error:'الفني موجود'});
    const hashed = await bcrypt.hash(password||'123456',10);
    const tech = await prisma.technician.create({
      data:{
        name: name||'فني',
        phone,
        password: hashed,
        city: city || province || null,
        province: province || city || null,
        country: country || null,
        countryCode: countryCode || null,
        specialty: specialty||'عام',
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        radiusKm: 10,
        locationLocked: !!(countryCode || country),
        lastLocationAt: (lat && lng) ? new Date() : null,
        lastSeenAt: new Date(),
      }
    });
        const token = makeTechToken(tech);
    res.json({ok:true, token, user:tech});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.post('/register', async (req,res)=>{
  try{
    const { name, phone, password, city, province, country, countryCode, specialty, lat, lng } = req.body;
        if(!phone) return res.status(400).json({error:'phone مطلوب'});
    const exists = await prisma.technician.findFirst({where:{phone}});
    if(exists) return res.status(400).json({error:'الفني موجود'});
    const hashed = await bcrypt.hash(password||'123456',10);
    const tech = await prisma.technician.create({
      data:{
        name: name||'فني',
        phone,
        password: hashed,
        city: city || province || null,
        province: province || city || null,
        country: country || null,
        countryCode: countryCode || null,
        specialty: specialty||'عام',
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        radiusKm: 10,
        locationLocked: !!(countryCode || country),
        lastLocationAt: (lat && lng) ? new Date() : null,
        lastSeenAt: new Date(),
      }
    });
        const token = makeTechToken(tech);
    res.json({ok:true, token, user:tech});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.post('/technician/login', authController.login);

module.exports = router;
