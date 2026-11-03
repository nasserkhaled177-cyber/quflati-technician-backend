const router = require("express").Router();
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/technicianOnlyController");
router.get("/my-requests", protect, authorize("TECHNICIAN","SUPER_ADMIN"), ctrl.getMyRequests);
router.put("/:id/status", protect, authorize("TECHNICIAN"), ctrl.updateStatus);
module.exports = router;
