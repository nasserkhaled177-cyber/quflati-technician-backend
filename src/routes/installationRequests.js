const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, '../../uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir,{recursive:true});
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, uploadDir),
  filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// انشاء طلب
router.post('/installation-requests', upload.array('media', 5), async (req,res)=>{
  try{
    const {type,city,address,latitude,longitude,customerName,customerPhone,note} = req.body;
    const files = (req.files||[]).map(f=>'/uploads/'+f.filename);
    const request = await prisma.installationRequest.create({
      data:{
        type: type||'emergency_open',
        city: city||'Aden',
        address: address||'',
        latitude: latitude? parseFloat(latitude) : null,
        longitude: longitude? parseFloat(longitude) : null,
        customerName: customerName||'عميل عدن',
        customerPhone: customerPhone||'777000000',
        note: note||'',
        media: JSON.stringify(files),
        status: 'PENDING'
      }
    });
    res.json({success:true, request});
  }catch(e){ console.log(e); res.status(500).json({error:e.message}) }
});

// جيب كل الطلبات - للفني
router.get('/installation-requests', async (req,res)=>{
  try{
    const {city} = req.query;
    const requests = await prisma.installationRequest.findMany({
      where: city? {city} : {},
      orderBy:{ createdAt:'desc' }
    });
    res.json({requests});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// جيب طلب واحد - لصفحة التفاصيل اللي ارسلتها
router.get('/installation-requests/:id', async (req,res)=>{
  try{
    const request = await prisma.installationRequest.findUnique({ where:{ id:req.params.id } });
    if(!request) return res.status(404).json({error:'not found'});
    res.json({request});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// تحديث حالة موحد - يربط مع الازرار الثلاثة في تصميمك
router.put('/installation-requests/:id/status', async (req,res)=>{
  try{
    const {status} = req.body;
    const map = {
      pending:'PENDING', accepted:'ACCEPTED', on_the_way:'ON_THE_WAY',
      arrived:'ARRIVED', completed:'COMPLETED',
      PENDING:'PENDING', ACCEPTED:'ACCEPTED', ON_THE_WAY:'ON_THE_WAY', ARRIVED:'ARRIVED', COMPLETED:'COMPLETED'
    };
    const updated = await prisma.installationRequest.update({
      where:{ id:req.params.id },
      data:{ status: map[status]||status }
    });
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});

// القديم حقك نخليه
router.put('/installation-requests/:id/accept', async (req,res)=>{
  try{
    const {technicianId}=req.body;
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'ACCEPTED', technicianId } });
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});
router.put('/installation-requests/:id/on-the-way', async (req,res)=>{
  try{
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'ON_THE_WAY' }});
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});
router.put('/installation-requests/:id/complete', async (req,res)=>{
  try{
    const updated=await prisma.installationRequest.update({ where:{ id:req.params.id }, data:{ status:'COMPLETED' }});
    res.json({success:true, request:updated});
  }catch(e){ res.status(500).json({error:e.message}) }
});

module.exports = router;
