FROM python:3.12-slim

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=5

WORKDIR /app

COPY games/gomoku/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY games/shared /app/shared
COPY games/gomoku /app/game

ENV PYTHONPATH=/app/shared:/app/game
WORKDIR /app/game
EXPOSE 8102
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8102"]
