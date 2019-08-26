import React, { useState } from 'react'
import AppBar from '@material-ui/core/AppBar'
import BottomNavigation from '@material-ui/core/BottomNavigation'
import BottomNavigationAction from '@material-ui/core/BottomNavigationAction'
import RestoreIcon from '@material-ui/icons/Restore'
import FavoriteIcon from '@material-ui/icons/Favorite'
import PersonIcon from '@material-ui/icons/Person'

const BottomNavBar = () => {
  const [value, setValue] = useState(0)

  return (
    <AppBar position='fixed' color='primary' style={{ top: 'auto', bottom: 0 }}>
      <BottomNavigation value={value} onChange={(event, newValue) => setValue(newValue)} showLabels>
        <BottomNavigationAction label='Challenges' icon={<RestoreIcon />} />
        <BottomNavigationAction label='Friends' icon={<FavoriteIcon />} />
        <BottomNavigationAction label='Profile' icon={<PersonIcon />} />
      </BottomNavigation>
    </AppBar>
  )
}

export default BottomNavBar
