# Spikes de visão (S1, S2)

Protótipos descartáveis para validar a câmera antes da Fase 3. O protocolo e os resultados ficam em [`docs/spikes/`](../docs/spikes/README.md).

## Rodar

```bash
npm install
npm run setup   # copia os runtimes WASM para public/vendor e baixa os modelos para public/models
npm run dev     # abre em http://localhost:5173 — use o Chrome
```

| Comando | O que faz |
|---|---|
| `npm test` | Testes unitários (CIEDE2000 contra os dados de Sharma, classificador e votação) |
| `npm run smoke` | Roda S1 e S2 no Chrome com a câmera falsa do navegador, para checar que tudo carrega. Os números desse teste não valem como benchmark |
| `npm run bench:s1` | Roda a matriz do S1 com a webcam real (o Chrome abre visível) e salva o relatório em `reports/` |
| `npm run build` | Faz o type-check e o build |

## Observações

- O `yolo11n.onnx` (Ultralytics, AGPL-3.0) serve só como carga de referência para o benchmark local. Ele fica fora do controle de versão e não deve ser redistribuído.
- O servidor envia COOP/COEP, o que permite o WASM multithread do ONNX Runtime. Todos os assets são locais.
