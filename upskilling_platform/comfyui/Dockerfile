FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    COMFYUI_HOME=/opt/ComfyUI

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        git \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git ${COMFYUI_HOME}

WORKDIR ${COMFYUI_HOME}

RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision torchaudio \
    && pip install -r requirements.txt

COPY docker-entrypoint.sh /usr/local/bin/comfyui-entrypoint.sh
RUN chmod +x /usr/local/bin/comfyui-entrypoint.sh

EXPOSE 8188

ENTRYPOINT ["/usr/local/bin/comfyui-entrypoint.sh"]
