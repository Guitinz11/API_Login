  -- MySQL Workbench Forward Engineering

  SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
  SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
  SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

  -- -----------------------------------------------------
  -- Schema corridas_db
  -- -----------------------------------------------------
  DROP SCHEMA IF EXISTS `corridas_db` ;

  -- -----------------------------------------------------
  -- Schema corridas_db
  -- -----------------------------------------------------
  CREATE SCHEMA IF NOT EXISTS `corridas_db` DEFAULT CHARACTER SET utf8 ;
  USE `corridas_db` ;

  -- -----------------------------------------------------
  -- Table `corridas_db`.`users`
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS `corridas_db`.`users` ;

  CREATE TABLE IF NOT EXISTS `corridas_db`.`users` (
    `id_users` INT NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `senha` VARCHAR(255) NOT NULL,
    `turma` VARCHAR(50) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_users`))
  ENGINE = InnoDB;


  -- -----------------------------------------------------
  -- Table `corridas_db`.`corredores`
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS `corridas_db`.`corredores` ;

  CREATE TABLE IF NOT EXISTS `corridas_db`.`corredores` (
    `id_corredores` INT NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `senha` VARCHAR(255) NOT NULL,
    `turma` VARCHAR(50) NOT NULL,
    `equipe` VARCHAR(100) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_corredores`))
  ENGINE = InnoDB;


  -- -----------------------------------------------------
  -- Table `corridas_db`.`voltas`
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS `corridas_db`.`voltas` ;

  CREATE TABLE IF NOT EXISTS `corridas_db`.`voltas` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `corredor_id` INT NOT NULL,
    `tempo` DECIMAL(10, 2),
    `data` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `fk_voltas_corredores_idx` (`corredor_id` ASC) VISIBLE,
    CONSTRAINT `fk_voltas_corredores`
      FOREIGN KEY (`corredor_id`)
      REFERENCES `corridas_db`.`corredores` (`id_corredores`)
      ON DELETE NO ACTION
      ON UPDATE NO ACTION)
  ENGINE = InnoDB;


  SET SQL_MODE=@OLD_SQL_MODE;
  SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
  SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;