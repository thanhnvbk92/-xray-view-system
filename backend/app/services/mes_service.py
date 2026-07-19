import oracledb
from .. import config
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def block_pcb_in_mes(pid: str, reason: str = "XRAY_NG_CONFIRMED", status: int = 1, pcb_type: str = "TOP"):
    """
    Gọi Stored Procedure P_TBL_BLOCK trên Oracle DB để block PCB
    """
    connection = None
    try:
        # Kết nối Oracle ở chế độ Thin mode (không cần Instant Client)
        connection = oracledb.connect(
            user=config.MES_DB_USER,
            password=config.MES_DB_PASS,
            host=config.MES_DB_HOST,
            port=config.MES_DB_PORT,
            service_name=config.MES_DB_SERVICE
        )

        cursor = connection.cursor()

        # Chuẩn bị các tham số cho Procedure
        # P_RETURN là OUT tham số
        p_return = cursor.var(oracledb.STRING)
        
        # P_RECEIPT_DATE (DATE)
        # P_RECEIPT_QTY (NUMBER)
        # P_PID (VARCHAR2)
        # P_PCB_TYPE (VARCHAR2)
        # P_STATUS (NUMBER)
        # P_REASON (NVARCHAR2)
        # P_RETURN (OUT VARCHAR2)
        
        params = [
            datetime.now(), # P_RECEIPT_DATE
            1,              # P_RECEIPT_QTY
            pid,            # P_PID
            pcb_type,       # P_PCB_TYPE
            status,         # P_STATUS
            reason,         # P_REASON
            p_return        # P_RETURN (OUT)
        ]

        logger.info(f"MES: Calling P_TBL_BLOCK for PID={pid}, Reason={reason}")
        cursor.callproc("P_TBL_BLOCK", params)
        
        result_msg = p_return.getvalue()
        logger.info(f"MES: Procedure result for PID={pid}: {result_msg}")
        
        connection.commit()
        return True, result_msg

    except Exception as e:
        logger.error(f"MES Error calling P_TBL_BLOCK for PID={pid}: {str(e)}")
        return False, str(e)
    
    finally:
        if connection:
            connection.close()
