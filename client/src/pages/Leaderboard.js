import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI
import { List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip } from '@material-ui/core'

// Components
import Navbar from '../components/layout/NavBar'
import FullHeightGrid from '../components/layout/FullHeightGrid'

const Profile = ({ user, users }) => {
  const sortedUsers = users.sort((a, b) => b.points - a.points)

  return (
    <Fragment>
      <Navbar text='Leaderboard' />
      <FullHeightGrid withNavbar style={{ padding: 0 }}>
        <List style={{ width: '100%', flexGrow: 1 }}>
          {sortedUsers &&
            sortedUsers.map(({ username, emoji, points }, index) => (
              <ListItem key={username} selected={username === user.username}>
                <ListItemAvatar>
                  <Avatar style={{ color: 'black', background: 'none' }}>
                    {index === 0 && '🥇'}
                    {index === 1 && '🥈'}
                    {index === 2 && '🥉'}
                    {index > 2 && index}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={emoji + username} />
                <Chip color='secondary' size='small' label={`${points} Points`} />
              </ListItem>
            ))}
        </List>
      </FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  users: PropTypes.array.isRequired,
  user: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
  users: state.auth.users,
  user: state.auth.user
})

export default connect(mapStateToProps)(Profile)
