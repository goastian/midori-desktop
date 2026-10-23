# Verificación de la entrega primaria de Sync

Alcance acordado el 23 de octubre de 2026: marcadores, historial, contraseñas,
tarjetas, formularios guardados, direcciones, pestañas y preferencias portables.
El servicio y el selector de Desktop usan la misma lista de ocho familias.
Las preferencias antiguas y las capacidades adicionales del servidor no activan
extensiones, configuración de extensiones, workspaces, permisos ni filtros.
La nueva pestaña continúa aplazada. Se conserva el trabajo realizado para la
próxima actualización, incluidos módulos, contratos, pruebas y prototipos archivados.
La [reserva versionable de Midori Tab](../deferred/midori-tab/README.md) conserva
las fuentes y pruebas sin incorporarlas al build.

Esta entrega comprueba Desktop Linux y el backend compartido. Las colecciones
pertenecen a la cuenta y no se separan por Desktop/Mobile; una validación del
cliente Mobile real, Windows/macOS y publicación sigue siendo trabajo posterior.
Las migraciones de GUID o colas heredadas incompatibles permanecen pendientes;
el esquema experimental de alias de contraseñas sigue desactivado en el servicio.

## Comprobaciones actuales

- [x] Selector y sincronización automática limitados a las ocho familias primarias,
  aun con todas las capacidades y preferencias antiguas habilitadas.
- [x] Código y pruebas de las ampliaciones conservados y temporalmente desactivados.
- [x] Compilación de interfaz: `mach build faster`.
- [x] Pruebas fuente: 58 archivos aprobados.
- [x] Regresión final sobre el diario corregido: 30 archivos nativos y
  2055 comprobaciones, sin fallos.
- [x] Interfaz real headless: 14 archivos, 1363 comprobaciones aprobadas,
  incluidos popup, sesión, recuperación, selección y uso de autocompletado.
- [x] Backend en PostgreSQL aislado: 255 pruebas, 3037 comprobaciones aprobadas.
- [x] Intercambio HTTP entre perfiles reales, reapertura y sincronización automática:
  ocho procesos A/B/G/H/E/F/C/D, 153 comprobaciones aprobadas.
- [x] Intercambio de formularios y direcciones entre dos perfiles:
  seis procesos A/B/A/B/A/B, 222 comprobaciones aprobadas contra 8000.

## Corrección del recorrido de perfiles

El recorrido xpcshell anterior se detuvo con `native_write_failed` al intentar
persistir preferencias sin inicializar el archivo del perfil. La barrera nativa
rechazó correctamente la operación; no se modificó para aceptar ese caso.
El modo `profiles` utiliza ahora el navegador headless real, la misma prueba y
las mismas etapas A/B/G/H/E/F/C/D. El recorrido anterior se conserva como
`profiles-xpcshell` para referencia y adaptación posterior. El nuevo cargador
comparte los módulos de producción y aporta el transporte que antes daba `head.js`.

La primera ejecución con navegador real detectó una colisión de fixtures: H y E
usaban el mismo PAN sintético con distinto titular. El resultado `card_duplicate`
era correcto y evitó declarar una colección completada. Se asignó a E otro número
de prueba válido; no se cambiaron la deduplicación ni los controles de conflicto.
Las ejecuciones incompletas o fallidas no se cuentan como aprobadas.

La comprobación de finalización también espera el inventario paginado de historial,
no sólo el recibo de un registro individual. Se conserva un límite explícito y se
observan las páginas procesadas; no se cambia el planificador para forzar el éxito.
La aplicación del diario conserva únicamente la copia de recuperación específica,
sin arrastrar metadatos de una operación previa a otra aplicación.

El chequeo de estilo de las fuentes del proyecto no introduce errores. Aplicar
la configuración adicional del árbol Gecko arroja 26 diagnósticos ya presentes
antes de limitar el alcance; la comparación exacta se conserva en
`artifacts/sync-2026-10-23-primary-gecko-lint-comparison.json`.


## Evidencia final

[Informe verificable y huellas](../artifacts/sync-2026-10-23-primary-validation.json).
La copia de los archivos comprobados se conserva en
`artifacts/sync-primary-checkpoint-20261023/`.

Los recorridos HTTP usaron cuentas sintéticas y PostgreSQL aislado. La instancia
propia de 8000 se inició cuando el puerto estaba libre y se detuvo después de las
pruebas. No se usó el perfil personal ni el perfil de login visible anterior.
No se hicieron commits ni push. Los pendientes de otras plataformas, Mobile real,
migraciones heredadas, capacidad y publicación siguen en el plan para las siguientes
etapas; esta verificación cierra el alcance primario local acordado.
