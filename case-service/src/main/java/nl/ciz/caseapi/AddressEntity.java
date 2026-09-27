package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "addresses")
public class AddressEntity extends PanacheEntityBase {
    @Id
    @Column(name = "address_id", nullable = false)
    public UUID addressId;

    @Column(name = "person_id", nullable = false)
    public UUID personId;

    @Column(nullable = false, length = 120)
    public String street;

    @Column(name = "house_number", nullable = false, length = 20)
    public String houseNumber;

    @Column(name = "postal_code", nullable = false, length = 12)
    public String postalCode;

    @Column(nullable = false, length = 120)
    public String city;

    @Column(nullable = false, length = 80)
    public String country;
}
