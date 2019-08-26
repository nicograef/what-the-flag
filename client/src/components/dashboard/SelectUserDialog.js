// React and Redux
import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { getUsers } from '../../actions/auth'

// Material UI
import { Dialog, List, ListItem, ListItemText, TextField } from '@material-ui/core'

function SelectUserDialog({ open, onClose, onSelect, users, getUsers }) {
  useEffect(() => {
    getUsers()
  }, [getUsers])

  return (
    <Dialog onClose={onClose} open={open}>
      {/* <DialogTitle>Select a Friend</DialogTitle> */}
      <TextField variant='filled' name='search' type='text' placeholder='search user' />
      <List>
        {users &&
          users.map(user => (
            <ListItem button onClick={() => onSelect(user.username)} key={user.username}>
              <ListItemText primary={user.emoji + user.username} />
            </ListItem>
          ))}
      </List>
    </Dialog>
  )
}

SelectUserDialog.propTypes = {
  onSelect: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  users: PropTypes.array,
  getUsers: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  users: state.auth.users
})

export default connect(
  mapStateToProps,
  { getUsers }
)(SelectUserDialog)
