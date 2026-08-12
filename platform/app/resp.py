from fastapi.responses import JSONResponse


def ok(data=None, message="OK", status=200):
    return JSONResponse({"code": 200, "message": message, "data": data}, status_code=status)


def err(code: int, message: str):
    return JSONResponse({"code": code, "message": message, "data": None}, status_code=code)
