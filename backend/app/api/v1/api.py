from fastapi import APIRouter
from .endpoints import (
    auth,
    master,
    machines,
    pcbs,
    stats,
    system,
    analysis
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(master.router, tags=["master-data"])
api_router.include_router(machines.router, prefix="/machines", tags=["machines"])
api_router.include_router(pcbs.router, prefix="/pcbs", tags=["pcbs"])
api_router.include_router(stats.router, prefix="/dashboard", tags=["stats"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(system.router, tags=["system"])
