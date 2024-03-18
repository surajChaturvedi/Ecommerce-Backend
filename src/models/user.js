"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class users extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      users.hasOne(models.tokens, { foreignKey: "user_id" });
      users.hasOne(models.user_address, { foreignKey: "user_id" });
      users.hasOne(models.user_payment, { foreignKey: "user_id" });
    }
  }
  users.init(
    {
      username: DataTypes.STRING,
      password: DataTypes.STRING,
      firstName: DataTypes.STRING,
      middleName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      mobile: DataTypes.INTEGER,
      email: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "user",
      paranoid: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
    }
  );
  return users;
};
