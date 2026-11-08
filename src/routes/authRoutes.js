const express = require('express');
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
    const { name, phone, password, city, specialty, lat, lng } = req.body;
    if(!phone) return res.status(400).json({error:'phone مطلوب'});
    const exists = await prisma.technician.findUnique({where:{phone}});
    if(exists) return res.status(400).json({error:'الفني موجود'});
    const hashed = await bcrypt.hash(password||'123456',10);
    const tech = await prisma.technician.create({
      data:{ name:name||'فني', phone, password:hashed, city: city||'Riyadh', specialty: specialty||'عام', lat, lng }
    });
    res.json({ok:true, user:tech});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.post('/register', async (req,res)=>{
  try{
    const { name, phone, password, city, specialty, lat, lng } = req.body;
    if(!phone) return res.status(400).json({error:'phone مطلوب'});
    const exists = await prisma.technician.findUnique({where:{phone}});
    if(exists) return res.status(400).json({error:'الفني موجود'});
    const hashed = await bcrypt.hash(password||'123456',10);
    const tech = await prisma.technician.create({
      data:{ name:name||'فني', phone, password:hashed, city: city||'Riyadh', specialty: specialty||'عام', lat, lng }
    });
    res.json({ok:true, user:tech});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}) }
});

router.post('/technician/login', authController.login);

module.exports = router;
