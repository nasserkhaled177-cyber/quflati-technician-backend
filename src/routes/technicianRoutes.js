const router = require("express").Router();
const { protect, authorize } = require("../middleware/auth");
const techCtrl = require("../controllers/technicianController");
router.use(protect);
router.get("/my-jobs", authorize("TECHNICIAN"), techCtrl.myAssigned);
router.put("/:id/complete", authorize("TECHNICIAN"), techCtrl.completeJob);
module.exports = router;
