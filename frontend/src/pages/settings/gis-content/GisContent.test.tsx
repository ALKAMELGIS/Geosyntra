import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { resetGisContentPortalForTests } from '../../../lib/gisContentPortalStore'
import GisContent from './GisContent'

function renderGis() {
  return render(
    <MemoryRouter>
      <GisContent />
    </MemoryRouter>,
  )
}

describe('GisContent', () => {
  beforeEach(() => {
    resetGisContentPortalForTests()
  })
  afterEach(() => cleanup())
  it('renders ArcGIS-style content portal chrome', () => {
    renderGis()
    expect(screen.getByRole('navigation', { name: /content navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /my content/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /new item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create app/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search all my content/i)).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /more actions for geosyntra — organization dashboard/i }),
    ).toBeInTheDocument()
  })

  it('opens Feature layer wizard from New item modal', () => {
    renderGis()
    fireEvent.click(screen.getByTestId('gis-portal-new-item-btn'))
    fireEvent.click(screen.getByRole('button', { name: /^Feature layer/i }))
    expect(screen.getByRole('dialog', { name: /create a feature layer/i })).toBeInTheDocument()
    expect(screen.getByText(/define your own layer/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    expect(screen.getByLabelText(/layer name/i)).toHaveValue('Layer_1')
  })

  it('opens 3D layer wizard from New item modal', () => {
    renderGis()
    fireEvent.click(screen.getByTestId('gis-portal-new-item-btn'))
    fireEvent.click(screen.getByRole('button', { name: /^3D layer/i }))
    expect(screen.getByRole('dialog', { name: /create a 3d layer/i })).toBeInTheDocument()
    expect(screen.getByText(/3D object layer/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    expect(screen.getByText(/define your own layer/i)).toBeInTheDocument()
  })

  it('opens row more menu with ArcGIS map viewer actions', () => {
    renderGis()
    const moreBtn = screen.getByRole('button', {
      name: /more actions for crop health — instant app/i,
    })
    fireEvent.click(moreBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /open in map viewer/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /open in field maps designer/i })).toBeInTheDocument()
  })

  it('moves item to recycle bin when Delete is chosen', () => {
    renderGis()
    fireEvent.click(
      screen.getByRole('button', { name: /more actions for irrigation zones — west block/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/moved to Recycle bin/i)
    fireEvent.click(screen.getByRole('button', { name: /^Recycle bin$/i }))
    expect(screen.getByRole('table')).toHaveTextContent('Irrigation zones — West block')
  })

  it('opens Create a folder dialog from the folders sidebar', () => {
    renderGis()
    fireEvent.click(screen.getByTestId('gis-portal-create-folder-btn'))
    expect(screen.getByRole('dialog', { name: /create a folder/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/folder name/i)).toBeInTheDocument()
    expect(screen.getByText(/folder options/i)).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /folder color/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/folder name/i), { target: { value: 'My saved layers' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/My saved layers.*created/i)
    expect(screen.getByRole('button', { name: /^My saved layers$/i })).toBeInTheDocument()
  })

  it('shows folder options menu with edit and delete for custom folders', () => {
    renderGis()
    fireEvent.click(screen.getByTestId('gis-portal-create-folder-btn'))
    fireEvent.change(screen.getByLabelText(/folder name/i), { target: { value: 'Ops layers' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Ops layers$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Folder options$/i }))
    expect(screen.getByRole('menuitem', { name: /edit folder/i })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: /delete folder/i })).toBeEnabled()
  })

  it('shows bulk toolbar actions when rows are selected', () => {
    renderGis()
    const checkboxes = screen.getAllByRole('checkbox', { name: /select/i })
    fireEvent.click(checkboxes[1])
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Share$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Move$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^More$/i })).toBeInTheDocument()
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it('moves selected items via bulk Move action', () => {
    renderGis()
    const rowCheckbox = screen.getAllByRole('checkbox', { name: /^Select /i })[1]
    fireEvent.click(rowCheckbox)
    fireEvent.click(screen.getByRole('button', { name: /^Move$/i }))
    const dialog = screen.getByRole('dialog', { name: /move 1 item/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Move$/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Moved 1 item/i)
  })

  it('opens Create app menu with StoryMaps and Dashboards', () => {
    renderGis()
    fireEvent.click(screen.getByRole('button', { name: /create app/i }))
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /geosyntra storymaps/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /dashboards/i })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })
})
