import os
import requests
from datetime import datetime
import pytz
from langchain.tools import BaseTool, ToolException
from pydantic import Field, BaseModel
from typing import Optional, Type
from dotenv import load_dotenv


load_dotenv(override=True)


OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY")


class LocationWeatherInput(BaseModel):
    ip: Optional[str] = Field(
        None,
        description="Public IP address of the user. If not provided, tool will auto-detect the caller's IP."
    )


class LocationWeatherTool(BaseTool):
    name: str = "location_weather_tool"
    description: str = (
        "Fetches user's current location, local date/time, and weather using their IP address."
    )
    args_schema: Type[BaseModel] = LocationWeatherInput


    def _run(self, ip: str = None) -> dict:
        """Sync implementation (safe for ToolNode or normal agent use)"""
        try:
            # 1️⃣ Get public IP if none provided
            if not ip:
                ip = requests.get("https://api.ipify.org").text


            # 2️⃣ Get location info from ip-api
            geo = requests.get(f"http://ip-api.com/json/{ip}").json()


            tzname = geo.get("timezone")
            local_time = None
            if tzname:
                tz = pytz.timezone(tzname)
                local_time = datetime.now(tz).isoformat()


            lat, lon = geo.get("lat"), geo.get("lon")
            weather = None
            if lat is not None and lon is not None:
                w = requests.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"lat": lat, "lon": lon, "appid": OPENWEATHER_KEY, "units": "metric"}
                ).json()
                weather = {
                    "temp": w["main"]["temp"],
                    "description": w["weather"][0]["description"],
                    "humidity": w["main"]["humidity"]
                }


            return {
                "ip": ip,
                "city": geo.get("city"),
                "region": geo.get("regionName"),
                "country": geo.get("country"),
                "timezone": tzname,
                "local_time": local_time,
                "weather": weather
            }


        except Exception as e:
            raise ToolException(f"Failed to fetch location and weather details. Error: {type(e).__name__}: {e}")


    async def _arun(self, ip: str = None) -> dict:
        """Optional async version"""
        import aiohttp, asyncio
        try:
            async with aiohttp.ClientSession() as session:
                if not ip:
                    async with session.get("https://api.ipify.org") as r:
                        ip = await r.text()


                async with session.get(f"http://ip-api.com/json/{ip}") as r:
                    geo = await r.json()


                tzname = geo.get("timezone")
                local_time = None
                if tzname:
                    tz = pytz.timezone(tzname)
                    local_time = datetime.now(tz).isoformat()


                lat, lon = geo.get("lat"), geo.get("lon")
                weather = None
                if lat is not None and lon is not None:
                    async with session.get(
                        "https://api.openweathermap.org/data/2.5/weather",
                        params={"lat": lat, "lon": lon, "appid": OPENWEATHER_KEY, "units": "metric"}
                    ) as wr:
                        w = await wr.json()
                        weather = {
                            "temp": w["main"]["temp"],
                            "description": w["weather"][0]["description"],
                            "humidity": w["main"]["humidity"]
                        }


                return {
                    "ip": ip,
                    "city": geo.get("city"),
                    "region": geo.get("regionName"),
                    "country": geo.get("country"),
                    "timezone": tzname,
                    "local_time": local_time,
                    "weather": weather
                }
        except Exception as e:
            raise ToolException(f"Failed to fetch location and weather details. Error: {type(e).__name__}: {e}")