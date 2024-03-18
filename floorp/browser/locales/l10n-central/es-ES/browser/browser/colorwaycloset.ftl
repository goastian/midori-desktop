# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#   $expiryDate (string) - date on which the colorway collection expires. When formatting this, you may omit the year, only exposing the month and day, as colorway collections will always expire within a year.
colorway-collection-expiry-label = Caducidad { DATETIME($expiryDate, month: "long", day: "numeric") }

# Document title, not shown in the UI but exposed through accessibility APIs
colorways-modal-title = Elija su combinación de colores

colorway-intensity-selector-label = Intensidad
colorway-intensity-soft = Suave
colorway-intensity-balanced = Equilibrado
# "Bold" is used in the sense of bravery or courage, not in the sense of
# emphasized text.
colorway-intensity-bold = Negrita

# Label for the button to keep using the selected colorway in the browser
colorway-closet-set-colorway-button = Establecer combinación de colores
colorway-closet-cancel-button = Cancelar

colorway-homepage-reset-prompt = Hacer de { -firefox-home-brand-name } su colorida página de inicio
colorway-homepage-reset-success-message = { -firefox-home-brand-name } es ahora su página de inicio
colorway-homepage-reset-apply-button = Aplicar
colorway-homepage-reset-undo-button = Deshacer
