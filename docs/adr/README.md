# Architecture Decision Records (ADR)

Registro de decisiones de arquitectura de TAIA. Cada ADR documenta una decisión vigente y por qué se tomó.

## Formato

Cada ADR sigue la estructura:
- **Estado**: Propuesto | Aceptado | Deprecado | Reemplazado
- **Contexto**: Problema o necesidad que motiva la decisión
- **Decision**: Lo que se decidió hacer
- **Consecuencias**: Impacto de la decisión

## Índice

| ADR | Título | Estado | Fecha |
|-----|--------|--------|-------|
| [002](./002-anthropic-adapter-design.md) | AnthropicAdapter — decisiones de diseño (Messages API, tools nativas, capabilities, streaming/cache deferidos) | Aceptado | 2026-05-05 |
| [003](./003-agent-context-bundle.md) | Agent Context Bundle — modelo de contexto agnóstico al runtime (5 capas, 3 tablas, versionado, capabilities tipadas) | Aceptado | 2026-05-06 |
| [004](./004-openclaw-gateway-protocol-v4.md) | OpenClaw Gateway: protocolo v4 con el cliente oficial, identidad de dispositivo y pairing | Aceptado | 2026-10-26 |
| [005](./005-runtime-owned-context-and-settings.md) | Proyección de contexto y settings de runtime a cargo del adapter (enmienda ADR-003) | Aceptado | 2026-10-26 |
| [006](./006-named-runtime-instances.md) | Instancias de runtime con nombre: cada agente corre en una instancia; pool de adapters en core | Aceptado | 2026-10-28 |
