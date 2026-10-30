import { useEffect, useState } from "react";
import { useFetchData } from "../../../../hooks/fetch";

const UseDeliveryMonths = () => {
    const { fetchData, error, loading } = useFetchData();
    const [deliveryMonths, setDeliveryMonths] = useState({})
    const [isMonthLoading, setMonthLoading] = useState(true)
    useEffect(() => {
        fetchData("/api/delivery-month")
            .then((res) => {
                console.log(res.data, "data from use month");
                setDeliveryMonths(res.data)
                setMonthLoading(false)
            }).catch((e) => {
                console.log(e);
            })
    },[fetchData])

    return { deliveryMonths, error, isMonthLoading }

};

export default UseDeliveryMonths;