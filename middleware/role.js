function requireRole(roleOrArray){
  return function(req, res, next){
    if(!req.session || !req.session.user) return res.redirect("/login");
    const current = req.session.user.role;
    if(Array.isArray(roleOrArray)){
      if(roleOrArray.includes(current)) return next();
    } else {
      if(current === roleOrArray) return next();
    }
    return res.status(403).send("Forbidden");
  };
}

module.exports = {
  requireRole,
  // helpers for convenience:
  isAdmin: requireRole("admin"),
  isCoordinator: requireRole("coordinator"),
  isMember: requireRole("member"),
  isSponsor: requireRole("sponsor"),
  isParticipant: requireRole("participant")
};
