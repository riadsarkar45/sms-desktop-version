import { useContext, useEffect } from 'react';
import UseAllUsers from './AllUsers';
import { AuthContext } from '../../auth/AuthContext';

const UseUserRoles = () => {
    const { user } = useContext(AuthContext);

    const { setOptionalUserId } = UseAllUsers();

    useEffect(() => {
        if (!user?.id) return;

        setOptionalUserId(user.id);
    }, [user?.id, setOptionalUserId]);

    const sections = Object.fromEntries(
        (user?.userRole || []).map(role => [
            role.permittedSection,
            Object.fromEntries(
                (role.isPermitted || []).map(permission => [
                    permission.isPermitted,
                    true
                ])
            )
        ])
    );


    return {
        sections
    };
};

export default UseUserRoles;